const express = require("express");
const router = express.Router();

const people = require("../Controller/people");
const { verifyTokenwithAuthorization } = require("../Middleware");
const attachRole = require("../Middleware/attachRole");

const Auth = [verifyTokenwithAuthorization, attachRole];

/**
 * Builder-only.
 *
 * This is the builder's address book: their clients, and the staff they have put
 * on sites. A client has no business seeing the builder's other clients, and
 * site staff have no reason to see either — a labour list with outstanding
 * balances beside it is commercial information.
 */
const builderOnly = (req, res, next) =>
    req.user?.role === "builder"
        ? next()
        : res.status(403).json({
              success: false,
              message: "Only the builder can see this.",
          });

router.get("/overview", Auth, builderOnly, people.peopleOverview);

module.exports = router;
