import React, { useState } from "react";
import { toast } from "react-toastify";
import { Input, Select } from "../../../components/ui";
import { useSubmitAdmissionInquiryMutation } from "../../../store/api/cms.api";
import styles from "./AdmissionsSection.module.css";

const AdmissionsSection: React.FC = () => {
  const [submitInquiry, { isLoading }] = useSubmitAdmissionInquiryMutation();

  const [formData, setFormData] = useState({
    studentName: "",
    parentName: "",
    phone: "",
    email: "",
    gradeApplyingFor: "Grade 1",
    currentSchool: "",
    message: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.studentName || !formData.parentName || !formData.phone) {
      toast.error("Please fill in all required fields (Student Name, Parent Name, Phone)");
      return;
    }

    try {
      const res = await submitInquiry(formData).unwrap();
      toast.success(res.message || "Thank you! Your admission enquiry has been received.");
      setFormData({
        studentName: "",
        parentName: "",
        phone: "",
        email: "",
        gradeApplyingFor: "Grade 1",
        currentSchool: "",
        message: "",
      });
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to submit admission enquiry. Please try again.");
    }
  };

  return (
    <section id="admissions" className={styles.admissionsSection}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.preTitle}>Join Our Thriving Community</span>
          <h2 className={styles.mainTitle}>Admissions Process & Inquiry</h2>
          <p className={styles.leadText}>
            We welcome learners with curious minds and passionate spirits. Begin your child’s educational journey with our seamless 4-step admission procedure.
          </p>
        </div>

        <div className={styles.grid}>
          {/* 4-Step Pathway */}
          <div className={styles.stepsColumn}>
            <h3 className={styles.stepsTitle}>4-Step Admission Pathway</h3>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepContent}>
                <h4>Online Inquiry Submission</h4>
                <p>Submit the quick form here. Our admissions counselor will connect with you within 24 business hours.</p>
              </div>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepContent}>
                <h4>Campus Tour & Briefing</h4>
                <p>Experience our smart classrooms, science labs, athletic turf, and interact with academic coordinators.</p>
              </div>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepContent}>
                <h4>Friendly Student Interaction</h4>
                <p>An informal diagnostic chat to understand the learner’s aptitudes, interests, and developmental milestones.</p>
              </div>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>4</div>
              <div className={styles.stepContent}>
                <h4>Enrollment & Welcome Kit</h4>
                <p>Document verification, fee finalization, and receipt of official admission kit with ERP login credentials.</p>
              </div>
            </div>
          </div>

          {/* Interactive Form Card */}
          <div className={styles.formCard}>
            <div className={styles.formHeader}>
              <h3 className={styles.formTitle}>Admission Inquiry Form</h3>
              <p className={styles.formSubtitle}>Academic Year 2026-27 • Nursery to Grade XII</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className={styles.formGrid}>
                <Input
                  label="Student Full Name *"
                  placeholder="e.g. Aarav Sharma"
                  value={formData.studentName}
                  onChange={(e) => handleChange("studentName", e.target.value)}
                  required
                />

                <Input
                  label="Parent / Guardian Name *"
                  placeholder="e.g. Rajesh Sharma"
                  value={formData.parentName}
                  onChange={(e) => handleChange("parentName", e.target.value)}
                  required
                />

                <Input
                  label="Contact Phone Number *"
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={formData.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  required
                />

                <Input
                  label="Email Address"
                  type="email"
                  placeholder="e.g. parent@example.com"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                />

                <Select
                  label="Grade Applying For *"
                  value={formData.gradeApplyingFor}
                  onChange={(e) => handleChange("gradeApplyingFor", e.target.value)}
                  options={[
                    { label: "Nursery / Playgroup", value: "Nursery" },
                    { label: "Kindergarten (LKG / UKG)", value: "Kindergarten" },
                    { label: "Grade 1", value: "Grade 1" },
                    { label: "Grade 2", value: "Grade 2" },
                    { label: "Grade 3", value: "Grade 3" },
                    { label: "Grade 4", value: "Grade 4" },
                    { label: "Grade 5", value: "Grade 5" },
                    { label: "Grade 6", value: "Grade 6" },
                    { label: "Grade 7", value: "Grade 7" },
                    { label: "Grade 8", value: "Grade 8" },
                    { label: "Grade 9", value: "Grade 9" },
                    { label: "Grade 10", value: "Grade 10" },
                    { label: "Grade 11 - Science", value: "Grade 11 Science" },
                    { label: "Grade 11 - Commerce", value: "Grade 11 Commerce" },
                    { label: "Grade 11 - Humanities", value: "Grade 11 Humanities" },
                  ]}
                  required
                />

                <Input
                  label="Current School (if applicable)"
                  placeholder="e.g. St. Xavier's"
                  value={formData.currentSchool}
                  onChange={(e) => handleChange("currentSchool", e.target.value)}
                />

                <div className={`${styles.textareaField} ${styles.fullWidth}`}>
                  <label>Questions / Special Requests (Optional)</label>
                  <textarea
                    className={styles.textarea}
                    placeholder="Tell us about your child's interests, hobbies, or transport requirements..."
                    value={formData.message}
                    onChange={(e) => handleChange("message", e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                {isLoading ? "Submitting Inquiry..." : "Submit Admission Inquiry"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AdmissionsSection;
