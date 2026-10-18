import React, { useState } from "react";
import { toast } from "react-toastify";
import { useGetPublicWebsiteDataQuery, useSubmitAdmissionInquiryMutation } from "../../store/api/cms.api";
import PublicNavbar from "./components/PublicNavbar";
import PublicFooter from "./components/PublicFooter";
import { Icon } from "../../components/ui";
import styles from "./AdmissionsPage.module.css";

const AdmissionsPage: React.FC = () => {
  const { data } = useGetPublicWebsiteDataQuery();
  const settings = data?.settings;

  const schoolName = settings?.schoolName || "RRS International School";
  const phone = settings?.phone || "+91 98765 43210";
  const email = settings?.email || "admissions@rrs-school.edu.in";

  const [submitInquiry, { isLoading }] = useSubmitAdmissionInquiryMutation();
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    studentName: "",
    parentName: "",
    email: "",
    phone: "",
    gradeApplyingFor: "Grade 1",
    currentSchool: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.studentName || !form.parentName || !form.phone || !form.gradeApplyingFor) {
      toast.error("Please fill in all required fields (*)");
      return;
    }

    try {
      await submitInquiry(form).unwrap();
      setSubmitted(true);
      toast.success("Enquiry submitted successfully! Our admissions team will connect shortly.");
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to submit enquiry. Please try again.");
    }
  };

  return (
    <div className={styles.page}>
      <PublicNavbar settings={settings} />

      <header className={styles.heroHeader}>
        <div className={styles.headerContainer}>
          <div className={styles.badge}>
            <Icon name="star" size={14} />
            <span>Academic Session 2026-27</span>
          </div>
          <h1 className={styles.title}>Begin Your Child's Journey of Distinction</h1>
          <p className={styles.subtitle}>
            Join a vibrant community of over 2,500 ambitious scholars. Admissions are now open from Nursery through Grade XI.
          </p>
        </div>
      </header>

      <main className={styles.container}>
        {/* Step-by-step roadmap */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.preTitle}>Seamless Process</span>
            <h2 className={styles.sectionTitle}>Four Steps to Join {schoolName}</h2>
          </div>

          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>1</div>
              <h3 className={styles.stepTitle}>Online Registration</h3>
              <p className={styles.stepText}>Fill out the online admission enquiry below or visit the campus admissions desk.</p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>2</div>
              <h3 className={styles.stepTitle}>Campus Walkthrough</h3>
              <p className={styles.stepText}>Interactive orientation and student-parent campus tour guided by academic counselors.</p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>3</div>
              <h3 className={styles.stepTitle}>Provisional Offer</h3>
              <p className={styles.stepText}>Verification of foundational records, student interaction, and confirmation of seat.</p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>4</div>
              <h3 className={styles.stepTitle}>Welcome & Induction</h3>
              <p className={styles.stepText}>Issuance of student ID kit, academic schedule, transport routing, and orientation.</p>
            </div>
          </div>
        </section>

        {/* Online Enquiry Form & Contact sidebar */}
        <section className={styles.section}>
          <div className={styles.inquirySection}>
            <div className={styles.inquirySidebar}>
              <h2 className={styles.inquiryHeading}>Admissions Helpdesk</h2>
              <p className={styles.inquirySub}>
                Have queries regarding eligibility, bus routes, or fee schedules? Our friendly admissions counselors are ready to guide you.
              </p>

              <div className={styles.contactBox}>
                <div className={styles.contactRow}>
                  <Icon name="phone" size={18} />
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Helpline</div>
                    <a href={`tel:${phone}`}>{phone}</a>
                  </div>
                </div>

                <div className={styles.contactRow}>
                  <Icon name="mail" size={18} />
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Official Inquiries</div>
                    <a href={`mailto:${email}`}>{email}</a>
                  </div>
                </div>

                <div className={styles.contactRow}>
                  <Icon name="calendar" size={18} />
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Visiting Hours</div>
                    <strong>Mon - Sat: 8:30 AM to 3:00 PM</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.inquiryFormWrapper}>
              {submitted ? (
                <div className={styles.successBox}>
                  <div className={styles.successIcon}>✓</div>
                  <h3 style={{ margin: "0 0 0.5rem 0", color: "#15803d", fontSize: "1.5rem" }}>Thank You!</h3>
                  <p style={{ color: "#166534", margin: "0 0 1.5rem 0" }}>
                    Your admission enquiry has been submitted to the admissions office. Our relationship manager will reach out within 24 hours.
                  </p>
                  <button
                    type="button"
                    className={styles.submitBtn}
                    onClick={() => {
                      setSubmitted(false);
                      setForm({
                        studentName: "",
                        parentName: "",
                        email: "",
                        phone: "",
                        gradeApplyingFor: "Grade 1",
                        currentSchool: "",
                        message: "",
                      });
                    }}
                  >
                    Submit Another Enquiry
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <h3 style={{ margin: "0 0 1.5rem 0", color: "#0a1f42", fontSize: "1.35rem" }}>
                    Online Admission Enquiry Form
                  </h3>

                  <div className={styles.formGrid}>
                    <div className={styles.field}>
                      <label>Student's Full Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Aarav Sharma"
                        value={form.studentName}
                        onChange={(e) => setForm({ ...form, studentName: e.target.value })}
                        required
                      />
                    </div>

                    <div className={styles.field}>
                      <label>Parent / Guardian Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Rajesh Sharma"
                        value={form.parentName}
                        onChange={(e) => setForm({ ...form, parentName: e.target.value })}
                        required
                      />
                    </div>

                    <div className={styles.field}>
                      <label>Contact Phone Number *</label>
                      <input
                        type="tel"
                        placeholder="e.g. +91 98765 43210"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        required
                      />
                    </div>

                    <div className={styles.field}>
                      <label>Email Address</label>
                      <input
                        type="email"
                        placeholder="e.g. parent@example.com"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </div>

                    <div className={styles.field}>
                      <label>Grade Applying For *</label>
                      <select
                        value={form.gradeApplyingFor}
                        onChange={(e) => setForm({ ...form, gradeApplyingFor: e.target.value })}
                        required
                      >
                        <option value="Nursery">Nursery (Age 3+)</option>
                        <option value="LKG / Prep">LKG / Prep (Age 4+)</option>
                        <option value="UKG">UKG (Age 5+)</option>
                        <option value="Grade 1">Grade 1</option>
                        <option value="Grade 2">Grade 2</option>
                        <option value="Grade 3">Grade 3</option>
                        <option value="Grade 4">Grade 4</option>
                        <option value="Grade 5">Grade 5</option>
                        <option value="Grade 6">Grade 6</option>
                        <option value="Grade 7">Grade 7</option>
                        <option value="Grade 8">Grade 8</option>
                        <option value="Grade 9">Grade 9</option>
                        <option value="Grade 11 - Science">Grade 11 (Science)</option>
                        <option value="Grade 11 - Commerce">Grade 11 (Commerce)</option>
                        <option value="Grade 11 - Humanities">Grade 11 (Humanities)</option>
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label>Current School (if applicable)</label>
                      <input
                        type="text"
                        placeholder="Previous institution attended"
                        value={form.currentSchool}
                        onChange={(e) => setForm({ ...form, currentSchool: e.target.value })}
                      />
                    </div>

                    <div className={`${styles.field} ${styles.fullWidth}`}>
                      <label>Any Specific Questions or Notes</label>
                      <textarea
                        rows={3}
                        placeholder="Transport requirement, sports coaching, scholarship queries..."
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                      />
                    </div>
                  </div>

                  <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                    {isLoading ? "Submitting..." : "Submit Admission Enquiry"}
                    <Icon name="arrowRight" size={16} />
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <PublicFooter settings={settings} />
    </div>
  );
};

export default AdmissionsPage;
