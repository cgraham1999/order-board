const axios = require('axios');
require('dotenv').config();

const clientId = process.env.TOAST_CLIENT_ID;
const clientSecret = process.env.TOAST_CLIENT_SECRET;
const locationId = process.env.TOAST_LOCATION_ID;
const baseUrl = process.env.TOAST_API_HOSTNAME;

// The GUID you want to search for specifically
const targetGuid = '7dd2960b-c8b6-4adc-8aa3-bf02af7c5ef0';

async function getAccessToken() {
  const response = await axios.post(`${baseUrl}/authentication/v1/authentication/login`, {
    clientId,
    clientSecret,
    userAccessType: 'TOAST_MACHINE_CLIENT',
  });

  return response.data.token.accessToken;
}

async function fetchMenuGroups() {
  try {
    const token = await getAccessToken();

    const response = await axios.get(`${baseUrl}/config/v2/menuGroups`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Toast-Restaurant-External-ID': locationId,
      },
    });

    const groups = response.data || [];
    console.log('🍽️ All Menu Groups with multiLocationId:\n');

    groups.forEach(group => {
      const name = group.name || 'Unnamed';
      const guid = group.guid || 'N/A';
      const multiId = group.multiLocationId || 'N/A';

      console.log(`- ${name} | GUID: ${guid} | multiLocationId: ${multiId}`);

      if (guid === targetGuid) {
        console.log('\n✅ MATCH FOUND:');
        console.log(`Name: ${name}`);
        console.log(`GUID: ${guid}`);
        console.log(`multiLocationId: ${multiId}`);
      }
    });

  } catch (err) {
    console.error('❌ Failed to fetch menu groups:', err.message);
    if (err.response?.data) {
      console.error(JSON.stringify(err.response.data, null, 2));
    }
  }
}

fetchMenuGroups();
