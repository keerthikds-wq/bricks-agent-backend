const jwt = require('jsonwebtoken');

/**
 * Core token extractor -- sets req.user and calls next().
 * Responds 401/403 if the token is missing or invalid.
 */
const auth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ status: 401, message: 'You are not authenticated.', error: true });
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    jwt.verify(token, process.env.SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ status: 403, message: 'Token is not valid.', error: true });
        }
        req.user = user;
        next();
    });
};

/** Requires a valid JWT (any role) */
const Auth = auth;

/** Requires the caller to be a Seller */
const sellerAuth = (req, res, next) => {
    auth(req, res, () => {
        if (req.user && req.user.isSeller) return next();
        return res.status(403).json({ status: 403, message: 'Access denied: Sellers only.', error: true });
    });
};

/** Requires the caller to be a User (buyer) */
const userAuth = (req, res, next) => {
    auth(req, res, () => {
        if (req.user && req.user.isUser) return next();
        return res.status(403).json({ status: 403, message: 'Access denied: Users only.', error: true });
    });
};

/** Requires the caller to be an Admin */
const adminAuth = (req, res, next) => {
    auth(req, res, () => {
        if (req.user && req.user.isAdmin) return next();
        return res.status(403).json({ status: 403, message: 'Access denied: Admins only.', error: true });
    });
};

/** Requires the caller to be a Masonry contractor */
const masonryAuth = (req, res, next) => {
    auth(req, res, () => {
        if (req.user && req.user.isMasonry) return next();
        return res.status(403).json({ status: 403, message: 'Access denied: Masonry contractors only.', error: true });
    });
};

/** Requires the caller to be a Builder */
const builderAuth = (req, res, next) => {
    auth(req, res, () => {
        if (req.user && req.user.isBuilder) return next();
        return res.status(403).json({ status: 403, message: 'Access denied: Builders only.', error: true });
    });
};

/**
 * Requires the caller to be a material supplier.
 *
 * Accepts BOTH the merged role (`role === 'vendor'`) and the legacy
 * `isSeller` flag. Without this, a Seller migrated to a `user` row by
 * Utils/migrations/001_builder_centric.js could no longer quote on RFQs —
 * their new token carries `role: 'vendor'` but not `isSeller`, so the old
 * `sellerAuth` gate would 403 them out of their own business.
 */
const vendorAuth = (req, res, next) => {
    auth(req, res, async () => {
        if (!req.user) {
            return res.status(403).json({ status: 403, message: 'Access denied: suppliers only.', error: true });
        }
        // Fast path: legacy seller token, or a token already carrying the role.
        if (req.user.isSeller || req.user.role === 'vendor') return next();

        // Login tokens do not include a `role` claim, so a merged vendor's
        // token looks like any other user's. Fall back to the record itself —
        // without this, genuine suppliers were 403'd out of quoting entirely.
        try {
            const User = require('../Model/User');
            const id = req.user.id || req.user._id;
            const u = id ? await User.findById(id).select('role').lean() : null;
            if (u && u.role === 'vendor') {
                req.user.role = 'vendor';
                return next();
            }
        } catch (e) {
            console.error('vendorAuth lookup error:', e.message);
        }
        return res.status(403).json({ status: 403, message: 'Access denied: suppliers only.', error: true });
    });
};

/** Allows any authenticated role (including masonry and builder) */
const verifyTokenwithAuthorization = (req, res, next) => {
    auth(req, res, () => {
        if (req.user && (req.user.isAdmin || req.user.isSeller || req.user.isUser || req.user.isMasonry || req.user.isBuilder)) {
            return next();
        }
        return res.status(403).json({ status: 403, message: 'You are not authorized.', error: true });
    });
};

module.exports = { Auth, auth, adminAuth, sellerAuth, vendorAuth, userAuth, masonryAuth, builderAuth, verifyTokenwithAuthorization };
