import { Router } from "express";
import { loginUser, registerUser, refreshToken } from "./controller";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";

const router = Router();

router.post("/login", loginUser);
// Creating raw user accounts is a Super Admin action (it used to be public, which let anyone
// create a SUPER_ADMIN). Staff/students are normally created through their own screens.
router.post("/register", authenticateToken, authorizeRoles(["SUPER_ADMIN"]), registerUser);
router.get("/ref-token", refreshToken);

export default router;
