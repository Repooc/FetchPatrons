const fs = require('fs');
const axios = require('axios');

const PATRON_CAMPAIGN_ID = process.env.PATRON_CAMPAIGN_ID;
const PATRON_ACCESS_TOKEN = process.env.PATRON_ACCESS_TOKEN;
const getTiers = process.env.GET_TIERS || false;

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
      console.log(`Fetching ${response.data.included.length} tiers`);
    }

    // All patrons have been fetched at this point
    console.log('Total Tiers Fetched:', tiers.length);
    return tiers;
  } catch (error) {
    if (error.response) {
      console.error('Error Response:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
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
      console.log(`Fetching ${response.data.data.length} patrons`);
    }
    console.log('Total Patrons Fetched:', patrons.length);

    return patrons;
  } catch (error) {
    if (error.response) {
      console.error('Error Response:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

function saveToFile(patrons) {
  const luaFilePath = 'patreons.lua';
  const topPatron = {};

  // Build the Lua Members table
  let luaData = 'local Patrons = {\n';

  patrons.forEach((patron) => {
    if (!topPatron.full_name || patron.attributes.lifetime_support_cents > topPatron.lifetime_support_cents) {
      topPatron.full_name = patron.attributes.full_name;
      topPatron.lifetime_support_cents = patron.attributes.lifetime_support_cents;
    }
  });
  console.log(`Top patron: ${topPatron.full_name} with lifetime_support_cents: ${topPatron.lifetime_support_cents}`);

  patrons.forEach((patron) => {
    luaData += `  { name = "${patron.attributes.full_name}", isActive = ${patron.attributes.patron_status === 'active_patron' ? 'true' : 'false'}, isTopPatron = ${patron.attributes.full_name === topPatron.full_name ? 'true' : 'false'} },\n`;
  });
  luaData += '}\n';

  // Check if the file exists and update the Members table accordingly
  if (fs.existsSync(luaFilePath)) {
    const fileContent = fs.readFileSync(luaFilePath, 'utf8');
    const membersTableRegex = /local Patrons = {(?:\n*\s*{[^}]*},?)*\n*}/; // Regex to find the Patrons table

    if (membersTableRegex.test(fileContent)) {
      // Replace the existing Patrons table
      const updatedContent = fileContent.replace(membersTableRegex, luaData.trim());
      fs.writeFileSync(luaFilePath, updatedContent, 'utf8');
    } else {
      // Prepend the new Members table to the existing content
      fs.writeFileSync(luaFilePath, luaData + '\n' + fileContent, 'utf8');
    }
  } else {
    // Create the file with the new Members table
    fs.writeFileSync(luaFilePath, luaData, 'utf8');
  }

  console.log('Patreon data saved to patreons.lua');
}

async function main() {
  try {
    if (getTiers) {
      const tiers = await fetchTiers();
      if (tiers) {
        // saveToFile(tiers); // Save tiers to Lua file
      }
    }
    const patrons = await fetchPatrons();
    if (patrons) {
      saveToFile(patrons); // Save patrons to Lua file
    }
  } catch (err) {
    console.error('Error fetching or saving patrons:', err);
  }
}

main();
