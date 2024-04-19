import { Octokit } from "@octokit/rest";
import { writeFileSync } from 'fs';
import {stringify} from 'csv-stringify/sync';

// Initialize GitHub API client
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN});

async function fetchBranches(owner, repo) {
    let branches = [];
    let response = await octokit.rest.repos.listBranches({
        owner,
        repo,
        protected: false, // or true, depending on your need
        per_page: 100
    });

    branches = response.data.map(branch => branch.name);

    // Remove branches already merged
    branches = await Promise.all(branches.map(async (branch) => {
        const isMerged = await octokit.rest.repos.getBranch({
            owner,
            repo,
            branch
        }).then(branchInfo => {
            return branchInfo.data.commit.commit.author.date;
        }).catch(err => false); // Adjust logic based on your criteria

        return isMerged ? null : branch;
    }));

    branches = branches.filter(branch => branch !== null);

    return branches;
}

async function generateCSV(owner, repo) {
    const branches = await fetchBranches(owner, repo);
    const data = branches.map(branch => {
        // Calculate 'active' or 'stale', need more info for accurate calculation
        let lastCommitDate = new Date(branch.commit.commit.author.date);
        let today = new Date();
        let diffDays = parseInt((today - lastCommitDate) / (1000 * 60 * 60 * 24), 10);
        let status = diffDays > 30 ? 'stale' : 'active';

        return {
            Branch: branch,
            Status: status
        };
    });

    const csv = stringify(data, {
        header: true,
        columns: {
            Branch: 'Branch',
            Status: 'Status'
        }
    });

    writeFileSync('branches.csv', csv);
    console.log('CSV file has been generated.');
}

generateCSV('your_github_username', 'your_repository_name');
