const axios = require('axios');

/**
 * Send OTP via WhatsApp Business Cloud API (Meta Graph API v19).
 *
 * Setup in Meta Business Manager:
 *   1. Create a WhatsApp Business account & phone number
 *   2. Create and submit an OTP message template for approval
 *      Template body example: "Your Bricks Agent OTP is {{1}}. Valid for 5 minutes."
 *   3. Set env vars: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN
 *   4. Optionally set WHATSAPP_OTP_TEMPLATE (default: bricks_otp) and WHATSAPP_LANGUAGE (default: en)
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
 */
const sendWhatsAppOtp = async (phone, otp) => {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
    const templateName  = process.env.WHATSAPP_OTP_TEMPLATE || 'bricks_otp';
    const languageCode  = process.env.WHATSAPP_LANGUAGE     || 'en';

    if (!phoneNumberId || !accessToken) {
        console.log('========================================');
        console.log(`[DEV] WhatsApp OTP for ${phone}: ${otp}`);
        console.log('(Set WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN to send real messages)');
        console.log('========================================');
        return;
    }

    // Ensure E.164 format — prefix Indian country code if absent
    const to = String(phone).startsWith('91') ? String(phone) : `91${phone}`;

    const response = await axios.post(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
        {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
                name: templateName,
                language: { code: languageCode },
                components: [
                    {
                        type: 'body',
                        parameters: [{ type: 'text', text: String(otp) }],
                    },
                ],
            },
        },
        {
            headers: {
                Authorization:  `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            timeout: 8000,
        }
    );

    return response.data;
};

module.exports = { sendWhatsAppOtp };
