import { ADMISSION_DOCUMENTS, ADMISSION_STEPS, AGE_CRITERIA, IMAGES } from "./content";
import { SiteIcon } from "./icons";
import { EnquiryForm, FaqList, PageBanner, Reveal, SectionHead, cx } from "./parts";
import { telHref, usePageTitle, useSite } from "./useSite";
import s from "./site.module.css";
import { Link } from "react-router-dom";
import { useGetPublicAdmissionSettingsQuery } from "../../store/api/admissions.api";

const AdmissionsPage = () => {
  const { settings, session, faqs } = useSite();
  usePageTitle("Admissions", settings.schoolName);
  const { data: online } = useGetPublicAdmissionSettingsQuery();

  return (
    <>
      <PageBanner
        crumb="Admissions"
        title={`Admissions ${session}`}
        text={settings.admissionNotice || "We welcome families who share our belief in caring, all-round education."}
        image={IMAGES.smartClassroom}
      />

      <section className={cx(s.section, s.sectionTight)}>
        <div className={s.container}>
          <div className={s.card} style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <h2 className={s.cardTitle} style={{ fontSize: "1.25rem" }}>
                {online?.isOpen ? `Online applications are open${online.sessionName ? ` for ${online.sessionName}` : ""}` : "Apply or check an application"}
              </h2>
              <p className={s.cardText}>
                {online?.isOpen
                  ? `Fill the form online${online.classes.some((c) => c.fee > 0) && online.onlinePayment ? " and pay the registration fee by UPI or card" : ""}. Keep your application number to check the status.`
                  : "Online applications open when the admission season starts. You can send an enquiry any time."}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {online?.isOpen && (
                <Link to="/admissions/apply" className={cx(s.btn, s.btnPrimary)}>
                  Apply online <SiteIcon name="arrowRight" size={18} />
                </Link>
              )}
              <Link to="/admissions/status" className={cx(s.btn, s.btnOutline)}>
                Check application status
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.container}>
          <SectionHead eyebrow="How to apply" title="Admission process" lead="A simple, transparent process — our admissions team will guide you at every step." />
          <ol className={s.steps} style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {ADMISSION_STEPS.map((st, i) => (
              <li key={st.title}>
                <Reveal delay={i * 70}>
                  <div className={s.step} style={{ height: "100%" }}>
                    <div className={s.stepNum}>{i + 1}</div>
                    <div className={s.stepTitle}>{st.title}</div>
                    <p className={s.stepText}>{st.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={cx(s.section, s.sectionMist)}>
        <div className={cx(s.container, s.grid2)} style={{ alignItems: "start" }}>
          <Reveal>
            <h2 className={s.sectionTitle} style={{ fontSize: "1.7rem", marginBottom: 18 }}>
              Age criteria
            </h2>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Age (as on 31 March)</th>
                </tr>
              </thead>
              <tbody>
                {AGE_CRITERIA.map((a) => (
                  <tr key={a.grade}>
                    <td style={{ fontWeight: 700 }}>{a.grade}</td>
                    <td>{a.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
          <Reveal delay={100}>
            <h2 className={s.sectionTitle} style={{ fontSize: "1.7rem", marginBottom: 18 }}>
              Documents required
            </h2>
            <div className={s.card}>
              <ul className={s.checkList} style={{ marginTop: 0 }}>
                {ADMISSION_DOCUMENTS.map((d) => (
                  <li key={d}>
                    <SiteIcon name="fileText" size={18} />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      <section className={s.section} id="enquiry" style={{ scrollMarginTop: 90 }}>
        <div className={cx(s.container, s.split)} style={{ alignItems: "start" }}>
          <Reveal>
            <SectionHead align="left" eyebrow="Get in touch" title="Start your child's journey with us" lead="Send an enquiry and we'll call you to answer your questions and arrange a campus visit." />
            <div style={{ display: "grid", gap: 14, marginTop: -16 }}>
              {settings.phone && (
                <a href={telHref(settings.phone)} className={s.contactCard}>
                  <span className={s.quickIcon}>
                    <SiteIcon name="phone" size={20} />
                  </span>
                  <span>
                    <span className={s.contactLabel} style={{ display: "block" }}>
                      Admissions helpline
                    </span>
                    <span className={s.contactValue}>{settings.phone}</span>
                  </span>
                </a>
              )}
              {settings.email && (
                <a href={`mailto:${settings.email}`} className={s.contactCard}>
                  <span className={s.quickIcon}>
                    <SiteIcon name="mail" size={20} />
                  </span>
                  <span>
                    <span className={s.contactLabel} style={{ display: "block" }}>
                      Email
                    </span>
                    <span className={s.contactValue}>{settings.email}</span>
                  </span>
                </a>
              )}
              <div className={s.contactCard}>
                <span className={s.quickIcon}>
                  <SiteIcon name="clock" size={20} />
                </span>
                <span>
                  <span className={s.contactLabel} style={{ display: "block" }}>
                    Admissions office
                  </span>
                  <span className={s.contactValue}>{settings.officeHours || "Monday – Saturday, 9:00 AM – 2:00 PM"}</span>
                </span>
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <EnquiryForm session={session} />
          </Reveal>
        </div>
      </section>

      {faqs.length > 0 && (
        <section className={cx(s.section, s.sectionMist)}>
          <div className={s.container}>
            <SectionHead eyebrow="FAQs" title="Frequently asked questions" />
            <FaqList faqs={faqs} />
          </div>
        </section>
      )}
    </>
  );
};

export default AdmissionsPage;
