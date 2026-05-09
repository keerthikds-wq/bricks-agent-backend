const axios = require("axios");

/**
 * Sends an OTP via TextLocal SMS gateway.
 * Requires TEXTLOCAL_API_KEY and TEXTLOCAL_SENDER env variables.
 */
const sendOtp = async (numbers, otpnum) => {
    const msg = `Hi,\n \nYour OTP for login to Bricks Agent account is ${otpnum}. It is valid for 5 mins.\n \nBricks Agent Team\n(A Product of Swami Vivekananda Technologies Pvt Ltd)`;

    try {
        const tlClient = axios.create({
            baseURL: "https://api.textlocal.in/",
            params: {
                apiKey: process.env.TEXTLOCAL_API_KEY,
                sender:  process.env.TEXTLOCAL_SENDER || "SVTPLC",
                numbers,
                message: msg,
            },
        });

        const response = await tlClient.post('/send', {});
        if (response.status === 200) {
            console.log(`OTP sent to ${numbers}`);
        } else {
            console.warn(`TextLocal response: ${response.status}`);
        }
    } catch (error) {
        console.error("OTP send failed:", error.message);
        // Don't throw — a failed OTP send should not crash the request flow;
        // the caller can decide how to handle the silent failure.
    }
};

module.exports = { sendOtp };
