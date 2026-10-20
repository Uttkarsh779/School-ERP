import { Link } from "react-router-dom";
import { IMAGES } from "./content";
import { SiteIcon, type SiteIconName } from "./icons";
import { PageBanner, Reveal, SectionHead, cx } from "./parts";
import { telHref, usePageTitle, useSite, whatsappHref } from "./useSite";
import s from "./site.module.css";

const ContactPage = () => {
  const { settings } = useSite();
  usePageTitle("Contact Us", settings.schoolName);
  const wa = whatsappHref(settings.whatsapp);

  const cards: { icon: SiteIconName; label: string; value?: string | null; href?: string | null }[] = [
    { icon: "pin", label: "Address", value: settings.address },
    { icon: "phone", label: "Phone", value: settings.phone, href: settings.phone ? telHref(settings.phone) : null },
    { icon: "whatsapp", label: "WhatsApp", value: settings.whatsapp, href: wa },
    { icon: "mail", label: "Email", value: settings.email, href: settings.email ? `mailto:${settings.email}` : null },
    { icon: "clock", label: "Office hours", value: settings.officeHours || "Monday – Saturday, 9:00 AM – 2:00 PM" },
  ];
  const directions = settings.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${settings.schoolName}, ${settings.address}`)}` : null;

  return (
    <>
      <PageBanner crumb="Contact" title="Contact Us" text="We'd love to hear from you. Call, write or visit us during office hours." image={IMAGES.campusHero} />

      <section className={s.section}>
        <div className={cx(s.container, s.split)} style={{ alignItems: "start" }}>
          <Reveal>
            <SectionHead align="left" eyebrow="Get in touch" title={settings.schoolName} />
            <div style={{ display: "grid", gap: 14, marginTop: -20 }}>
              {cards
                .filter((c) => c.value)
                .map((c) => {
                  const inner = (
                    <>
                      <span className={s.quickIcon}>
                        <SiteIcon name={c.icon} size={20} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className={s.contactLabel} style={{ display: "block" }}>
                          {c.label}
                        </span>
                        <span className={s.contactValue}>{c.value}</span>
                      </span>
                    </>
                  );
                  return c.href ? (
                    <a key={c.label} href={c.href} className={s.contactCard} {...(c.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                      {inner}
                    </a>
                  ) : (
                    <div key={c.label} className={s.contactCard}>
                      {inner}
                    </div>
                  );
                })}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
              <Link to="/admissions#enquiry" className={cx(s.btn, s.btnPrimary)}>
                Admission enquiry <SiteIcon name="arrowRight" size={18} />
              </Link>
              {directions && (
                <a href={directions} target="_blank" rel="noopener noreferrer" className={cx(s.btn, s.btnOutline)}>
                  <SiteIcon name="pin" size={17} /> Get directions
                </a>
              )}
            </div>
          </Reveal>
          <Reveal delay={120}>
            {settings.mapEmbedUrl ? (
              <iframe
                title={`Map showing ${settings.schoolName}`}
                src={settings.mapEmbedUrl}
                className={s.map}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            ) : (
              <div className={s.mapPlaceholder}>
                <div>
                  <SiteIcon name="pin" size={44} style={{ margin: "0 auto 14px", color: "var(--accent-500)" }} />
                  <p style={{ fontWeight: 700, fontSize: "1.1rem", color: "#fff" }}>{settings.address || settings.schoolName}</p>
                  {directions && (
                    <a href={directions} target="_blank" rel="noopener noreferrer" className={cx(s.btn, s.btnGhostLight, s.btnSm)} style={{ marginTop: 18 }}>
                      Open in Google Maps
                    </a>
                  )}
                </div>
              </div>
            )}
          </Reveal>
        </div>
      </section>
    </>
  );
};

export default ContactPage;
