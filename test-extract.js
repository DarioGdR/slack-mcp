import { getSlackCredentials } from './credentials.js';

async function run() {
  console.log("=== Slack Credentials Extraction Diagnostic ===");
  try {
    const creds = getSlackCredentials();
    console.log(`✅ Extraction Source: ${creds.source}`);
    console.log(`🔐 Token Prefix: ${creds.token.substring(0, 10)}... (length: ${creds.token.length})`);
    console.log(`🍪 Cookie 'd' Present: ${!!creds.cookieD} (prefix: ${creds.cookieD ? creds.cookieD.substring(0, 8) : 'none'})`);
    console.log(`🍪 Cookie 'd-s' Present: ${!!creds.cookieDS}`);

    console.log("\n📡 Testing auth.test endpoint against Slack Web API...");
    const cookieHeader = creds.cookieDS ? `d=${creds.cookieD}; d-s=${creds.cookieDS}` : `d=${creds.cookieD}`;
    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creds.token}`,
        "Cookie": cookieHeader,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    });

    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
    if (data.ok) {
      console.log(`\n🎉 Authentication Successful! User: ${data.user}, Team: ${data.team}`);
    } else {
      console.error(`\n❌ Authentication Failed: ${data.error}`);
    }
  } catch (err) {
    console.error("❌ Diagnostic Failed:", err.message);
  }
}

run();
