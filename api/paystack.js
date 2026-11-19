
const PACKAGES = {
  1: 470,
  2: 950,
  3: 1430,
  4: 1950,
  5: 2600,
  6: 3000,
  8: 3800,
  10: 4600,
  15: 6500,
  20: 8500,
  25: 10600,
  30: 12800,
  40: 17800,
  50: 21000
};

const NETWORKS = ["MTN", "MTN Mash Up", "Telecel", "AirtelTigo"];

const PAYSTACK_URL = "https://api.paystack.co";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    return res.status(500).json({
      error: "Payment service is not configured yet."
    });
  }

  try {
    const { action } = req.body || {};

    if (action === "initialize") {
      const {
        email,
        phone,
        network,
        size
      } = req.body;

      const amount = PACKAGES[Number(size)];

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Enter a valid email." });
      }

      if (!phone || !/^0\d{9}$/.test(phone)) {
        return res.status(400).json({ error: "Enter a valid Ghana phone number." });
      }

      if (!NETWORKS.includes(network) || !amount) {
        return res.status(400).json({ error: "Invalid package selection." });
      }

      const origin = req.headers.origin;
      const allowedOrigin = process.env.APP_URL;

      if (!allowedOrigin) {
        return res.status(500).json({ error: "Website URL is not configured." });
      }

      const callbackUrl = allowedOrigin.replace(/\/$/, "") + "/payment-success.html";

      const response = await fetch(PAYSTACK_URL + "/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + secret,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          amount,
          currency: "GHS",
          callback_url: callbackUrl,
          metadata: {
            custom_fields: [
              {
                display_name: "Recipient phone",
                variable_name: "recipient_phone",
                value: phone
              },
              {
                display_name: "Network",
                variable_name: "network",
                value: network
              },
              {
                display_name: "Data bundle",
                variable_name: "data_bundle",
                value: Number(size) + "GB"
              }
            ]
          }
        })
      });

      const data = await response.json();

      if (!response.ok || !data.status || !data.data?.authorization_url) {
        return res.status(502).json({
          error: data.message || "Could not start payment."
        });
      }

      return res.status(200).json({
        authorization_url: data.data.authorization_url,
        reference: data.data.reference
      });
    }

    if (action === "verify") {
      const { reference } = req.body;

      if (!reference || typeof reference !== "string" || reference.length > 100) {
        return res.status(400).json({ error: "Invalid payment reference." });
      }

      const response = await fetch(
        PAYSTACK_URL + "/transaction/verify/" + encodeURIComponent(reference),
        {
          headers: {
            Authorization: "Bearer " + secret
          }
        }
      );

      const data = await response.json();

      if (!response.ok || !data.status) {
        return res.status(502).json({ error: "Could not verify payment." });
      }

      const payment = data.data;

      return res.status(200).json({
        paid: payment.status === "success" && payment.currency === "GHS",
        status: payment.status,
        reference: payment.reference,
        amount: payment.amount,
        currency: payment.currency
      });
    }

    return res.status(400).json({ error: "Unknown payment action." });

  } catch (error) {
    return res.status(500).json({
      error: "Payment service error. Please try again."
    });
  }
};
