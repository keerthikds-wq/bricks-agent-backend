const { v4: uuidv4 } = require('uuid');
const { jwt } = require('../config');
const RefreshToken = require('../Model/RefreshToken');

const ACCESS_TOKEN_EXPIRY = '1d';  // short-lived; refresh token handles re-auth
const REFRESH_TOKEN_DAYS  = 90;    // PhonePe-style — 90 days without OTP

const generateAccessToken = (payload) =>
    jwt.sign(payload, process.env.SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });

/**
 * Issues an access token + a persisted refresh token for one device.
 * Revokes any prior refresh token for the same (user, device) pair so only
 * one active session exists per device.
 *
 * device_id: unique fingerprint sent by the client (e.g. flutter_device_id).
 *            Pass 'none' when the client does not send one — refresh will skip
 *            device validation in that case.
 */
const issueTokenPair = async ({ userId, userType, payload, deviceId, deviceName }) => {
    const safeDeviceId = deviceId || 'none';

    // Revoke the previous session for this device (one active session per device)
    if (safeDeviceId !== 'none') {
        await RefreshToken.updateOne(
            { user_id: userId, device_id: safeDeviceId, is_revoked: false },
            { $set: { is_revoked: true } }
        );
    }

    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    await RefreshToken.create({
        token,
        user_id:     userId,
        user_type:   userType,
        device_id:   safeDeviceId,
        device_name: deviceName || 'Unknown Device',
        expires_at:  expiresAt,
    });

    return {
        accessToken:  generateAccessToken(payload),
        refreshToken: token,
        expiresIn:    86400,  // seconds — matches '1d'
    };
};

module.exports = { generateAccessToken, issueTokenPair };
