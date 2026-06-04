const { sendWhatsAppOtp } = require('./whatsapp');

/**
 * Deliver OTP to the user's phone via WhatsApp Business Cloud API.
 * Errors are caught here so a delivery failure never blocks the login response —
 * the OTP is already persisted in MongoDB and the user can retry sending.
 */
const sendOtp = async (phone, otp) => {
    try {
        await sendWhatsAppOtp(phone, otp);
    } catch (err) {
        console.error(
            `WhatsApp OTP delivery failed for ${phone}:`,
            err?.response?.data || err.message
        );
    }
};

module.exports = { sendOtp };
