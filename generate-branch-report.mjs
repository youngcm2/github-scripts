import { Octokit } from "@octokit/rest";
import { writeFileSync } from 'fs';
import {stringify} from 'csv-stringify/sync';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Setup yargs to handle command line arguments
const argv = yargs(hideBin(process.argv))
    .option('owner', {
        alias: 'o',
        description: 'GitHub repository owner',
        type: 'string',
        demandOption: true,
    })
    .option('repo', {
        alias: 'r',
        description: 'GitHub repository name',
        type: 'string',
        demandOption: true,
    })
    .option('token', {
        alias: 't',
        description: 'GitHub personal access token',
        type: 'string',
        demandOption: false,
    })
    .help()
    .alias('help', 'h')
    .argv;

// Initialize GitHub API client
const octokit = new Octokit({ auth: argv.token || process.env.GITHUB_TOKEN });

async function fetchBranchesAndPRs(owner, repo) {
    let branches = [];
    let response = await octokit.rest.repos.listBranches({
        owner,
        repo,
        protected: false,
        per_page: 100
    });

    branches = response.data;

    // Enhance branches with PR information
    const enhancedBranches = await Promise.all(branches.map(async (branch) => {
        const { name } = branch;
        try {
            const branchResponse = await octokit.rest.repos.getBranch({
                owner,
                repo,
                branch: name
            });
            const {author, committer} = branchResponse.data.commit?.commit || branchResponse.data.commit;

            const prs = await octokit.rest.pulls.list({
                owner,
                repo,
                head: `${owner}:${name}`,
                state: 'all'
            });
            if (prs.data.length > 0) {
                const pr = prs.data[0];

                return {
                    name,
                    lastCommitLogin: committer.name,
                    lastCommitAuthor: author.name,
                    lastCommitDate: author.date,
                    prOwner: pr.user.login,
                    prNumber: pr.number,
                    prState: pr.merged_at ? 'Merged' : pr.closed_at ? 'Closed' : 'Open',
                    merged: pr.merged_at ? 'Yes' : 'No',
                };
            }
            return {
                name,
                lastCommitLogin: committer.login,
                lastCommitAuthor: author.name,
                lastCommitDate: author.date,
                prOwner: 'None',
                prNumber: 'None',
                prState: 'No PR',
                merged: 'No'
            };
        } catch (error) {
            return {
                name,
                lastCommitDate: branch.commit?.commit?.author.date,
                prNumber: 'Error',
                prState: 'Failed to fetch',
                merged: 'Error'
            };
        }
    }));

    return enhancedBranches;
}

async function generateCSV(owner, repo) {
    const branches = await fetchBranchesAndPRs(owner, repo);
    const data = branches.map(branch => ({
        Branch: branch.name,
        'Last Commit Login': branch.lastCommitLogin,
        'Last Commit Author': branch.lastCommitAuthor,
        'Last Commit Date': branch.lastCommitDate,
        'Owner': branch.prOwner,
        'PR Number': branch.prNumber,
        'PR State': branch.prState,
        'Merged': branch.merged
    }));

    const csv = stringify(data, {
        header: true,
        columns: [
            'Branch',
            'Last Commit Login',
            'Last Commit Author',
            'Last Commit Date',
            'Owner',
            'PR Number',
            'PR State',
            'Merged'
        ]
    });

    writeFileSync('output/branches_with_prs.csv', csv);
    console.log('CSV file has been generated.');
}

await generateCSV(argv.owner, argv.repo);
