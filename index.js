const { inspect } = require('util');
const core = require('@actions/core');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const PATRON_CAMPAIGN_ID = process.env.PATRON_CAMPAIGN_ID;
const PATRON_ACCESS_TOKEN = process.env.PATRON_ACCESS_TOKEN;
const getTiers = process.env.GET_TIERS || false;
const luaFilePath = process.env.FILE_PATH_AND_NAME || 'patrons.lua'; // you can change the file path and name here ex: './test/patrons.lua'

if (!PATRON_CAMPAIGN_ID || !PATRON_ACCESS_TOKEN) {
  throw new Error('PATRON_CAMPAIGN_ID and PATRON_ACCESS_TOKEN must be set');
}

const headers = {
  Authorization: `Bearer ${PATRON_ACCESS_TOKEN}`,
  Accept: 'application/json',
  'User-Agent': 'axios/1.7.7',
};

async function fetchTiers(pageUrl = `https://www.patreon.com/api/oauth2/v2/campaigns/${PATRON_CAMPAIGN_ID}?include=tiers&fields%5Btier%5D=patron_count,title,amount_cents`) {
  let tiers = [];

  try {
    while (pageUrl) {
      const response = await axios.get(pageUrl, { headers: headers });

      // Collect the patron data
      tiers.push(...response.data.included);

      // Check if there's a 'next' page
      pageUrl = response.data.links?.next;

      core.info(`Fetching ${response.data.included.length} tiers`);
    }

    // All patrons have been fetched at this point
    core.info('Total Tiers Fetched:', tiers.length);

    return tiers;
  } catch (error) {
    if (error.response) {
      core.debug('Error Response:', error.response.status, error.response.data);
      core.setFailed(error.response.status, error.response.data);
    } else {
      core.debug('Error:', error.message);
      core.setFailed(error.message);
    }
  }
}

async function fetchPatrons(
  pageUrl = `https://www.patreon.com/api/oauth2/v2/campaigns/${PATRON_CAMPAIGN_ID}/members?include=currently_entitled_tiers&fields%5Bmember%5D=campaign_lifetime_support_cents,currently_entitled_amount_cents,full_name,lifetime_support_cents,next_charge_date,note,patron_status,pledge_cadence&fields%5Btier%5D=patron_count,title`
) {
  const patrons = [];

  try {
    while (pageUrl) {
      const response = await axios.get(pageUrl, { headers: headers });
      patrons.push(...response.data.data);

      pageUrl = response.data.links?.next;

      core.info(`Fetching ${response.data.data.length} patrons`);
    }
    core.info('Total Patrons Fetched:', patrons.length);

    return patrons;
  } catch (error) {
    // Let's fail here :P
    if (error.response) {
      core.debug(inspect('Error Response:', error.response.status, error.response.data));
      core.setFailed(error.response.status, error.response.data);
    } else {
      core.debug(inspect('Error Response:', error.response.status, error.response.data));
      core.setFailed(error.message);
    }
  }
}

function saveToFile(patrons) {
  const topPatron = {};

  // Build the Lua table
  let luaData = 'local Patrons = {\n';

  patrons.forEach((patron) => {
    if (!topPatron.full_name || patron.attributes.lifetime_support_cents > topPatron.lifetime_support_cents) {
      topPatron.full_name = patron.attributes.full_name;
      topPatron.lifetime_support_cents = patron.attributes.lifetime_support_cents;
    }
  });
  core.info(`Top patron: ${topPatron.full_name} with lifetime_support_cents: ${topPatron.lifetime_support_cents}`);

  patrons.forEach((patron) => {
    luaData += `  { name = "${patron.attributes.full_name}", isActive = ${patron.attributes.patron_status === 'active_patron' ? 'true' : 'false'}, isTopPatron = ${patron.attributes.full_name === topPatron.full_name ? 'true' : 'false'} },\n`;
  });
  luaData += '}\n';

  try {
    // Check if the file exists
    if (fs.existsSync(luaFilePath)) {
      const fileContent = fs.readFileSync(luaFilePath, 'utf8');
      const membersTableRegex = /local Patrons = {(?:\n*\s*{[^}]*},?)*\n*}/; // Regex to find the Patrons table

      if (membersTableRegex.test(fileContent)) {
        // Replace the existing table
        const updatedContent = fileContent.replace(membersTableRegex, luaData.trim());
        fs.writeFileSync(luaFilePath, updatedContent, 'utf8');
      } else {
        // Prepend the new table to the existing content
        fs.writeFileSync(luaFilePath, luaData + '\n' + fileContent, 'utf8');
      }
    } else {
      // Ensure the directory exists
      const dir = path.dirname(luaFilePath);
      if (!fs.existsSync(dir)) {
        // Create the directory recursively
        fs.mkdirSync(dir, { recursive: true });
      }

      // Create the file
      fs.writeFileSync(luaFilePath, luaData, 'utf8');
    }
    core.notice(`Patreon data saved to ${luaFilePath}`);
  } catch (error) {
    core.debug(inspect(error));
    core.setFailed(error.message);
  }
}

async function main() {
  try {
    // Tiers are not yet implemented
    if (getTiers) {
      const tiers = await fetchTiers();
      if (tiers) {
        // saveToFile(tiers);
      }
    }
    const patrons = await fetchPatrons();
    if (patrons) {
      saveToFile(patrons);
    }
  } catch (error) {
    core.debug(inspect(error));
    core.setFailed(error.message);
  }
}

main();
