const { inspect } = require('util');
const core = require('@actions/core');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const PATRON_CAMPAIGN_ID = core.getInput('patron_campaign_id') || process.env.PATRON_CAMPAIGN_ID;
const PATRON_ACCESS_TOKEN = core.getInput('patron_access_token') || process.env.PATRON_ACCESS_TOKEN;
if (!PATRON_CAMPAIGN_ID || !PATRON_ACCESS_TOKEN) {
  core.setFailed('PATRON_CAMPAIGN_ID and PATRON_ACCESS_TOKEN must be set');
}

const outputFormat = core.getInput('output_format') || process.env.OUTPUT_FORMAT || 'lua'; // Allowed values: 'lua' or 'json'
// Validate the output format to allow only 'json' or 'lua'
const validFormats = ['lua', 'json'];
if (!validFormats.includes(outputFormat)) {
  core.setFailed(`Invalid output format. Must be one of: ${validFormats.join(', ')}`);
}

// const getTiers = core.getBooleanInput('get_tiers') || (process.env.GET_TIERS ? process.env.GET_TIERS.toLowerCase() === 'true' : false);
const isGetTiers = core.getInput('get_tiers') || (process.env.GET_TIERS || 'false').toLowerCase();
// const getTiers = isGetTiers === 'true';
const getTiers = false; // Disabled for now

const filePath = core.getInput('file_path') || process.env.FILE_PATH || './';
let fileName = core.getInput('file_name') || process.env.FILE_NAME || 'patrons.lua';

// Ensure the file extension matches the output format
if (outputFormat === 'json' && !fileName.endsWith('.json')) {
  const oldFileName = fileName;
  fileName = fileName.replace(/\.[^/.]+$/, '') + '.json'; // Change to .json
  core.notice(`File name changed from '${oldFileName}' to '${fileName}' to match the JSON output format.`);
} else if (outputFormat === 'lua' && !fileName.endsWith('.lua')) {
  const oldFileName = fileName;
  fileName = fileName.replace(/\.[^/.]+$/, '') + '.lua'; // Change to .lua
  core.notice(`File name changed from '${oldFileName}' to '${fileName}' to match the Lua output format.`);
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

  while (pageUrl) {
    const response = await axios.get(pageUrl, { headers: headers });
    patrons.push(...response.data.data);
    pageUrl = response.data.links?.next;

    core.info(`Fetching ${response.data.data.length} patrons`);
  }

  core.info('Total Patrons Fetched:', patrons.length);
  return patrons;
}

function saveToFile(patrons) {
  const topPatron = {};
  patrons.forEach((patron) => {
    if (!topPatron.full_name || patron.attributes.lifetime_support_cents > topPatron.lifetime_support_cents) {
      topPatron.full_name = patron.attributes.full_name;
      topPatron.lifetime_support_cents = patron.attributes.lifetime_support_cents;
    }
  });

  core.info(`Top patron: ${topPatron.full_name} with lifetime_support_cents: ${topPatron.lifetime_support_cents}`);

  const fullFilePath = path.join(filePath, fileName);

  if (outputFormat === 'json') {
    const jsonData = patrons.map((patron) => ({
      name: patron.attributes.full_name,
      isActive: patron.attributes.patron_status === 'active_patron',
      isTopPatron: patron.attributes.full_name === topPatron.full_name,
    }));

    if (!fs.existsSync(filePath)) {
      core.notice(`${filePath} does not exist. Creating ${filePath} path for you now.`);
      fs.mkdirSync(filePath, { recursive: true });
      core.notice(`Successfully created the ${filePath} path.`);
    }
    fs.writeFileSync(fullFilePath, JSON.stringify(jsonData, null, 2), 'utf8');
    core.notice(`Patreon data saved as JSON to ${fullFilePath}`);
  } else {
    let luaData = 'local Patrons = {\n';

    patrons.forEach((patron) => {
      luaData += `  { name = "${patron.attributes.full_name}", isActive = ${patron.attributes.patron_status === 'active_patron' ? 'true' : 'false'}, isTopPatron = ${patron.attributes.full_name === topPatron.full_name ? 'true' : 'false'} },\n`;
    });
    luaData += '}\n';

    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(filePath, { recursive: true });
    }
    if (fs.existsSync(fullFilePath)) {
      const fileContent = fs.readFileSync(fullFilePath, 'utf8');
      const membersTableRegex = /local Patrons = {(?:\n*\s*{[^}]*},?)*\n*}/;

      if (membersTableRegex.test(fileContent)) {
        // Replace the existing table
        const updatedContent = fileContent.replace(membersTableRegex, luaData.trim());
        fs.writeFileSync(fullFilePath, updatedContent, 'utf8');
      } else {
        // Prepend the new table to the existing content
        fs.writeFileSync(fullFilePath, luaData + '\n' + fileContent, 'utf8');
      }
    } else {
      fs.writeFileSync(fullFilePath, luaData, 'utf8');
    }
    core.notice(`Patreon data saved to ${fullFilePath}`);
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
