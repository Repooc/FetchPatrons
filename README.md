# FetchPatrons GitHub Action

This GitHub Action fetches patron data from the Patreon API and updates a Lua file (`patreons.lua`) with the list of patrons. It can be used to automatically sync Patreon data and manage it in a Lua table format, such as for integrating with a project or an application.

## Setup

### Prerequisites

- **Patreon Campaign ID** and **Access Token**: You will need to have a Patreon Campaign ID and Access Token. These can be set as secrets in your repository to keep them secure.

### Secrets Setup

1. Go to your GitHub repository.
2. Click on `Settings` > `Secrets and variables` > `Actions` > `New repository secret`.
3. Add the following secrets:
   - `PATRON_CAMPAIGN_ID`: Your Patreon Campaign ID.
   - `PATRON_ACCESS_TOKEN`: Your Patreon API Access Token.

### Workflow Example

Below is an example of how to set up a workflow file to use the action. This workflow fetches the patron data, updates the Lua file, and creates a pull request with the changes.

```yaml
name: Update Patron Data

# Schedule the workflow to run periodically (e.g., every Sunday at midnight)
on:
  schedule:
    - cron: "0 0 * * 0"  # Adjust as needed (weekly)

# This is needed if using secrets.GITHUB_TOKEN, you can omit this (if I'm not mistaken) if you have created a token for this specifically.
# You will need to enable the option, Allow GitHub Actions to create and approve pull requests, in order to make pull requests with GitHub Actions regardless of what token you use. You can find this by going to Settings -> Code and automation -> Actions -> General -> Workflow permissions
permissions:
  contents: write
  pull-requests: write

jobs:
  updatePatronList:
    runs-on: ubuntu-latest
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      PATRON_CAMPAIGN_ID: ${{ secrets.PATRON_CAMPAIGN_ID }}
      PATRON_ACCESS_TOKEN: ${{ secrets.PATRON_ACCESS_TOKEN }}
    steps:
      # Step 1: Clone the repository
      - name: Clone Project
        uses: actions/checkout@v4
        with:
          fetch-depth: 99

      # Step 2: Fetch and update the patron data using the custom action
      - name: Run Fetch Patrons
        uses: Repooc/FetchPatrons@v1.0.1

      # Step 3: Create a pull request with the updated data
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v7
        with:
          commit-message: "Update Patrons"
          title: "Update Patrons"
          body: "Patron data has been updated automatically"
          token: ${{ env.GITHUB_TOKEN }}
          branch: main
```

### Running the Workflow
To run this workflow:

1. Add the workflow file to .github/workflows/update_patrons.yml in your repository.
2. The workflow can be scheduled to run at specific intervals (e.g., weekly) using the cron expression in the schedule trigger.

Alternatively, you can trigger the workflow manually by pushing changes or through the Actions tab in your GitHub repository.

### Notes
Avoid frequent runs: It's recommended to run this workflow on a weekly or monthly interval, as fetching data from the Patreon API too often may lead to rate-limiting issues.
Automatic PR: This workflow uses the peter-evans/create-pull-request action to create a pull request with the updated Lua file.

Creating Pull Requests with GitHub Actions: If you plan on having the action create a pull request like the example, you will have to change the workflow permissions labeled, Allow GitHub Actions to create and approve pull requests.

1. Go to your GitHub repository.
2. Click on `Settings` > `Actions` > `General`
3. Click Allow GitHub Actions to create and approve pull requests
