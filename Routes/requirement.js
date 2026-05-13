const express = require("express");
const router = express.Router();
const { addRequirement, getRequirements, getMyRequirements, deleteRequirement } = require("../Controller/requirement");
const { userAuth, verifyTokenwithAuthorization } = require("../Utils");

router.post("/", userAuth, addRequirement);                        // Buyer posts a requirement
router.get("/", verifyTokenwithAuthorization, getRequirements);    // Sellers see all open requirements
router.get("/my", userAuth, getMyRequirements);                    // Buyer sees their own requirements
router.delete("/:id", userAuth, deleteRequirement);                // Buyer deletes their requirement

module.exports = router;
