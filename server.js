const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3000;

const clientId = process.env.TOAST_CLIENT_ID;
const clientSecret = process.env.TOAST_CLIENT_SECRET;
const locationId = process.env.TOAST_LOCATION_ID;
const baseUrl = process.env.TOAST_API_HOSTNAME;

let accessToken = null;
let tokenExpires = 0;

function formatDate(date) {
  return date.toISOString().replace(/Z$/, '+0000');
}

const allowedMenuGroupGuids = new Set([
'900000005197891538', // Breakfast
'900000005197890750', // Lunch and Dinner
'900000005197893437', // Specials
'900000005197891749', // Oatmeal
'900000005197891915', // Bacon
'900000005197891715', // Toast
'900000005197890752', // Burgers and Sandwiches
'900000005197890902', // Crispy Sides
'900000005197890930', // Entrees, Baskets and Meat
'900000005197891170', // Salads and cold food
'900000005197891160', // Misc
'900000005197891160', // Eggs and Omelets

]);

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpires) return accessToken;

  const response = await axios.post(`${baseUrl}/authentication/v1/authentication/login`, {
    clientId,
    clientSecret,
    userAccessType: 'TOAST_MACHINE_CLIENT',
  });

  accessToken = response.data.token.accessToken;
  tokenExpires = Date.now() + (response.data.token.expiresIn * 1000) - 60000;
  return accessToken;
}

app.use(express.static(__dirname));

app.get('/orders', async (req, res) => {
  try {
    const token = await getAccessToken();
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    const startDate = formatDate(start);
    const endDate = formatDate(now);

    console.log(`📦 Fetching order IDs from: ${baseUrl}/orders/v2/orders`);
    const idRes = await axios.get(`${baseUrl}/orders/v2/orders`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Toast-Restaurant-External-ID': locationId,
      },
      params: {
        startDate,
        endDate,
        pageSize: 50,
      },
    });

    const orderIds = idRes.data;
    console.log(`✅ Found ${orderIds.length} order IDs`);

    const ready = [];
    const progress = [];

    for (const id of orderIds) {
      try {
        const { data: order } = await axios.get(`${baseUrl}/orders/v2/orders/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Toast-Restaurant-External-ID': locationId,
          },
        });

        const name = order.checks?.[0]?.tabName || 'Guest';
        const number = order.displayNumber || null;
        const created = order.createdDate || null;
        const selections = order.checks?.[0]?.selections || [];

        console.log(`📋 Order ${number} selections:`);
        selections.forEach((s, i) => {
          console.log(`  • [${i}] fulfillmentStatus: ${s.fulfillmentStatus}, voided: ${s.voided}, itemGroup: ${s.itemGroup?.multiLocationId}`);
        });

        const hasAllowedMenuItem = selections.some(s =>
          allowedMenuGroupGuids.has(s.itemGroup?.multiLocationId)
        );

        if (!number || !hasAllowedMenuItem) {
          console.log(`🔴 Order ${number} skipped – no allowed menu group`);
          continue;
        }

        const minsSinceCreated = Math.round((Date.now() - new Date(created).getTime()) / 60000);
        if (minsSinceCreated > 35){
          console.log(`🕒 Skipping stale order ${number} (${minsSinceCreated} mins old)`);
          continue;
        }

        // 🔍 Filter out voided or unrelated items
        const validSelections = selections.filter(s =>
          allowedMenuGroupGuids.has(s.itemGroup?.multiLocationId) &&
          s.voided !== true &&
          s.fulfillmentStatus !== 'VOIDED'
        );

        // ✅ Use hybrid readiness logic
        const isOrderReady =
          (validSelections.length > 0 && validSelections.every(s => s.fulfillmentStatus === 'READY')) ||
          order.approvalStatus === 'READY_FOR_PICKUP';

        if (isOrderReady) {
          ready.push({ name, number });
        } else {
          const minsLeft = 20 - minsSinceCreated;

          let statusTime;
          if (minsLeft <= 0) {
            statusTime = `${minsSinceCreated} mins ago`;
          } else if (minsLeft > 18) {
            statusTime = 'Just placed';
          } else if (minsLeft <= 5) {
            statusTime = 'Almost ready';
          } else {
            statusTime = `${minsLeft} mins`;
          }

          progress.push({
            name,
            number,
            statusTime,
          });
        }

      } catch (err) {
        console.warn(`⚠️ Error fetching details for order ID ${id}: ${err.message}`);
      }
    }

    console.log('✅ Sending to frontend:', JSON.stringify({ ready, progress }, null, 2));
    res.json({ ready, progress });

  } catch (error) {
    console.error('❌ Error fetching orders:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    res.status(500).send('Error fetching orders');
  }
});

app.listen(PORT, () => {
  console.log(`✅ Order board running at http://localhost:${PORT}`);
});
