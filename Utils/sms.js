/**
 * SMS OTP delivery — TextLocal has shut down.
 * TODO: Implement WhatsApp OTP via official WhatsApp Business API.
 *
 * For now: OTP is saved in MongoDB and logged to server console.
 * Use master OTP "0000" in the app for testing until WhatsApp is wired up.
 */
const sendOtp = async (numbers, otpnum) => {
    // Log clearly so it's visible in Render dashboard logs during testing
    console.log(`========================================`);
    console.log(`OTP for ${numbers}: ${otpnum}`);
    console.log(`(SMS provider unavailable — use master OTP "0000" in app)`);
    console.log(`========================================`);
};

module.exports = { sendOtp };
