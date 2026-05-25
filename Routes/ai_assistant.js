const express = require('express');
const router  = express.Router();
const ctrl    = require('../Controller/ai_assistant');
const { verifyTokenwithAuthorization } = require('../Middleware');

// All AI routes require a valid JWT (any user type can use the assistant)
router.post('/chat',        verifyTokenwithAuthorization, ctrl.chat);
router.get('/usage',        verifyTokenwithAuthorization, ctrl.usage);
router.get('/suggestions',  verifyTokenwithAuthorization, ctrl.suggestions);

module.exports = router;
