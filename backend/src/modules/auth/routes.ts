import { Router } from "express";
import { loginUser, registerUser, refreshToken } from "./controller";

const router = Router();

router.post("/login", loginUser);
router.post("/register", registerUser);
router.get("/ref-token", refreshToken);

export default router;
