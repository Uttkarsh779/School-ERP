import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import styles from "./Login.module.css";
import logo from "../../assets/images/logo.png";
import Button from "../../components/Button";
import Input from "../../components/Input";
import Div from "../../components/Div";
import { Icon } from "../../components/ui";
import { useLoginUserMutation } from "../../store/services/user.api";
import { toast } from "react-toastify";
import { setTokens } from "../../store/reducers/authReducer";
import { useDispatch } from "react-redux";
import ForgotPassword from "./ForgotPassword";

// Validation schema — "email" doubles as a generic identifier: staff/admin sign in
// with an email, but students can sign in with either their email or their
// admission number, so this can't enforce email-shaped input.
const schema = yup.object().shape({
  email: yup.string().required("Email or Admission Number is required"),
  password: yup
    .string()
    .min(6, "Password must be at least 6 characters")
    .required("Password is required"),
});

type LoginMode = "family" | "staff";

const Login: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>("family");
  const [loginUser] = useLoginUserMutation();
  const dispatch = useDispatch();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ILoginFormInputs>({
    resolver: yupResolver(schema),
  });

  const onSubmit = async (data: ILoginFormInputs) => {
    setIsLoading(true);
    try {
      const response = (await loginUser({ ...data, loginMode } as any).unwrap()) as unknown as IResponse;
      if (response.success && response.data) {
        const { accessToken, refreshToken, user } = response.data;

        if (!accessToken) {
          toast.error("Missing tokens in response");
          setIsLoading(false);
          return;
        }

        // Validate role matches tab mode
        const isStudentRole = user?.role === "STUDENT";
        if (loginMode === "family" && !isStudentRole) {
          toast.error("Staff & Admin accounts must sign in from the Staff & Admin Sign In tab.");
          setIsLoading(false);
          return;
        }
        if (loginMode === "staff" && isStudentRole) {
          toast.error("Student accounts must sign in from the Student Sign In tab.");
          setIsLoading(false);
          return;
        }

        toast.success(response.message);
        dispatch(
          setTokens({
            accessToken,
            refreshToken,
            user: (user ?? {}) as IUser,
          })
        );
      }
    } catch (error: any) {
      console.error("Login failed:", error);
      const message = error?.data?.message || "Login failed. Please check your credentials and portal tab.";
      toast.error(message);
    }
    setIsLoading(false);
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  return (
      <div className={styles.loginPage}>
        <div className={styles.leftSection}>
          <div className={styles.logoContainer}>
            <h1 className={styles.collegeName}>RRS Intl School</h1>
            <p className={styles.portalTitle}>
              {loginMode === "family" ? "Student Portal" : "Staff & Admin Portal"}
            </p>
          </div>
          <div className={styles.imageContainer}>
            <img
              src={logo}
              alt="RRS Intl School"
              className={styles.heroImage}
            />
          </div>
        </div>

        <div className={styles.rightSection}>
          <div className={styles.loginCard}>
            {/* Phones: one compact brand row instead of the big header + headings */}
            <div className={styles.mobileBrand}>
              <img src={logo} alt="" className={styles.mobileLogo} />
              <div>
                <div className={styles.mobileName}>RRS Intl School</div>
                <div className={styles.mobileTag}>Student &amp; Staff login</div>
              </div>
            </div>
            <div className={styles.topBar}>
              <Link to="/" className={styles.backButton} aria-label="Back to School Website">
                <span className={styles.backButtonIconWrapper}>
                  <Icon name="arrowLeft" size={14} />
                </span>
                <span className={styles.backButtonText}>Back to School Website</span>
              </Link>
            </div>

            <AnimatePresence mode="wait">
              {!showForgotPassword ? (
              <Div key="login" direction="bottom" immediate>
                <div className={styles.modeToggle} role="tablist" aria-label="Login as">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={loginMode === "family"}
                    className={`${styles.modeButton} ${loginMode === "family" ? styles.modeButtonActive : ""}`}
                    onClick={() => setLoginMode("family")}
                  >
                    Student
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={loginMode === "staff"}
                    className={`${styles.modeButton} ${loginMode === "staff" ? styles.modeButtonActive : ""}`}
                    onClick={() => setLoginMode("staff")}
                  >
                    Staff / Admin
                  </button>
                </div>

                <h1 className={`${styles.title} ${styles.hideOnPhone}`}>
                  {loginMode === "family" ? "Student Sign In" : "Staff & Admin Sign In"}
                </h1>
                <p className={`${styles.subtitle} ${styles.hideOnPhone}`}>
                  {loginMode === "family"
                    ? "Sign in to your account"
                    : "Sign in to manage your school"}
                </p>

                <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
                  <Input
                    name="email"
                    label={loginMode === "family" ? "Admission Number or Email" : "Email"}
                    type="text"
                    register={register}
                    errors={errors}
                    required
                  />
                  <Input
                    name="password"
                    label="Password"
                    type="password"
                    register={register}
                    errors={errors}
                    required
                  />
                  <Button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    buttonType="link"
                    title="Forgot password?"
                  />

                  <Button
                    type="submit"
                    isLoading={isLoading}
                    buttonType="primary"
                    title="Sign In"
                  />
                </form>
                <Link to="/" className={styles.mobileBack}>
                  <Icon name="arrowLeft" size={14} /> Back to school website
                </Link>
              </Div>
            ) : (
              <Div key="forgot-password" direction="bottom" immediate>
                <ForgotPassword mode={loginMode} onBack={() => setShowForgotPassword(false)} />
              </Div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Login;
