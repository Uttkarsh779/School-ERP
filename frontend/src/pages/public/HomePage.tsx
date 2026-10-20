import { useState } from "react";
import { Link } from "react-router-dom";
import { ACADEMIC_STAGES, WHY_CHOOSE } from "./content";
import { SiteIcon, type SiteIconName } from "./icons";
import { CtaBand, FacilityCard, GalleryTile, Lightbox, NoticeCard, Reveal, SectionHead, SmartLink, TestimonialCard, cx } from "./parts";
import { usePageTitle, useSite } from "./useSite";
import s from "./site.module.css";

// Puts the last word of the hero title in the accent colour ("…Confident <em>Leaders</em>").
const accentTitle = (title: string) => {
  const i = title.trim().lastIndexOf(" ");
  if (i < 0) return title;
  return (
    <>
      {title.slice(0, i)} <em>{title.slice(i + 1)}</em>
    </>
  );
};

const HomePage = () => {
  const site = useSite();
  const { settings, session, stats } = site;
  const [lightbox, setLightbox] = useState<number | null>(null);
  usePageTitle(null, settings.schoolName);

  const quick: { to: string; icon: SiteIconName; title: string; text: string }[] = [
    { to: "/admissions", icon: "graduation", title: "Admissions", text: `Process, eligibility & enquiry for ${session}` },
    { to: "/notices", icon: "megaphone", title: "Notices", text: "Latest circulars, events and announcements" },
    { to: "/admin/login", icon: "login", title: "Parent & Student Portal", text: "Attendance, homework, results and fees" },
    { to: "/contact", icon: "pin", title: "Visit Us", text: "Directions, phone and office timings" },
  ];

  const galleryPreview = site.gallery.slice(0, 5);
  const notices = site.notices.slice(0, 4);
  const facilities = site.facilities.slice(0, 6);

  return (
    <>
      {/* Hero */}
      <section className={s.hero}>
        <img src={site.heroImage} alt="" className={s.heroBg} />
        <div className={s.heroShade} />
        <div className={s.container}>
          <div className={s.heroContent}>
            {settings.admissionsOpen && (
              <Link to="/admissions" className={s.heroPill}>
                <span className={s.heroPillDot}>Open</span>
                Admissions for session {session}
                <SiteIcon name="arrowRight" size={15} />
              </Link>
            )}
            <h1 className={s.heroTitle}>{accentTitle(settings.heroTitle)}</h1>
            <p className={s.heroText}>{settings.heroSubtitle}</p>
            <div className={s.heroCtas}>
              <SmartLink href={settings.heroCtaLink} className={cx(s.btn, s.btnAccent)}>
                {settings.heroCtaText} <SiteIcon name="arrowRight" size={18} />
              </SmartLink>
              <Link to="/about" className={cx(s.btn, s.btnGhostLight)}>
                Discover our school
              </Link>
            </div>
            <div className={s.heroMeta}>
              <span>
                <SiteIcon name="award" size={17} /> {settings.boardName} affiliated
              </span>
              <span>
                <SiteIcon name="calendar" size={17} /> Since {settings.establishedYear}
              </span>
              <span>
                <SiteIcon name="users" size={17} /> Nursery to Class XII
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Quick links */}
      <div className={s.quickLinks}>
        <div className={s.container}>
          <div className={s.quickGrid}>
            {quick.map((q) => (
              <Link key={q.to} to={q.to} className={s.quickItem}>
                <span className={s.quickIcon}>
                  <SiteIcon name={q.icon} size={22} />
                </span>
                <span>
                  <span className={s.quickTitle} style={{ display: "block" }}>
                    {q.title}
                  </span>
                  <span className={s.quickText} style={{ display: "block" }}>
                    {q.text}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* About */}
      <section className={s.section}>
        <div className={cx(s.container, s.split)}>
          <Reveal>
            <div className={s.frame}>
              <img src={site.aboutImage} alt={`${settings.schoolName} classroom`} className={s.frameImg} loading="lazy" />
              <div className={s.frameBadge}>
                <span className={s.frameBadgeValue}>{site.years}+</span>
                <span className={s.frameBadgeLabel}>
                  Years of
                  <br />
                  shaping futures
                </span>
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <SectionHead align="left" eyebrow={`Welcome to ${settings.schoolName}`} title={settings.tagline} />
            <div className={s.prose} style={{ marginTop: -24 }}>
              <p>{settings.aboutText}</p>
            </div>
            <ul className={s.checkList}>
              {WHY_CHOOSE.map((w) => (
                <li key={w.title}>
                  <SiteIcon name="check" size={18} strokeWidth={2.4} />
                  <span>
                    <strong>{w.title}</strong> — {w.text}
                  </span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link to="/about" className={cx(s.btn, s.btnPrimary)}>
                More about us <SiteIcon name="arrowRight" size={18} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Stats */}
      <section className={cx(s.sectionTight, s.sectionBrand)}>
        <div className={cx(s.container, s.statsBand)}>
          {stats.map((st) => (
            <div key={st.label} className={s.stat}>
              <div className={s.statValue}>{st.value}</div>
              <div className={s.statLabel}>{st.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Academics */}
      <section className={s.section}>
        <div className={s.container}>
          <SectionHead
            eyebrow="Academics"
            title="A clear path from first steps to board exams"
            lead={`Following the ${settings.boardName} curriculum, with care at every stage of your child's growth.`}
          />
          <div className={s.grid3}>
            {ACADEMIC_STAGES.slice(0, 3).map((st, i) => (
              <Reveal key={st.key} delay={i * 90}>
                <article className={cx(s.card, s.cardHover, s.stageCard)}>
                  <div className={s.cardIcon}>
                    <SiteIcon name={st.icon} size={24} />
                  </div>
                  <div className={s.stageMeta}>
                    <span className={s.chip}>{st.classes}</span>
                    <span className={cx(s.chip, s.chipAccent)}>{st.ages}</span>
                  </div>
                  <h3 className={s.cardTitle}>{st.name}</h3>
                  <p className={s.cardText}>{st.summary}</p>
                </article>
              </Reveal>
            ))}
          </div>
          <div className={s.sectionFoot}>
            <Link to="/academics" className={s.textLink}>
              Explore all stages, Classes IX – XII and streams <SiteIcon name="arrowRight" size={17} />
            </Link>
          </div>
        </div>
      </section>

      {/* Principal */}
      {settings.principalMessage && (
        <section className={cx(s.section, s.sectionMist)}>
          <div className={cx(s.container, s.principal)}>
            <Reveal>
              <img src={site.principalPhoto} alt={settings.principalName} className={s.principalPhoto} loading="lazy" />
            </Reveal>
            <Reveal delay={120}>
              <div className={s.eyebrow}>From the {settings.principalTitle}'s desk</div>
              <SiteIcon name="quote" size={40} className={s.quoteMark} strokeWidth={2.2} />
              <p className={s.principalQuote}>{settings.principalMessage}</p>
              <div className={s.principalName}>{settings.principalName}</div>
              <div className={s.principalRole}>
                {settings.principalTitle}, {settings.schoolName}
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* Facilities */}
      {facilities.length > 0 && (
        <section className={s.section}>
          <div className={s.container}>
            <SectionHead eyebrow="Campus & facilities" title="Spaces that make learning come alive" lead="Everything a child needs to learn, play, create and stay safe — on one campus." />
            <div className={s.grid3}>
              {facilities.map((f, i) => (
                <Reveal key={f.id} delay={(i % 3) * 90}>
                  <FacilityCard facility={f} />
                </Reveal>
              ))}
            </div>
            <div className={s.sectionFoot}>
              <Link to="/campus" className={cx(s.btn, s.btnOutline)}>
                Explore campus life
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Notices + admissions */}
      <section className={cx(s.section, s.sectionMist)}>
        <div className={s.container}>
          <SectionHead eyebrow="Notice board" title="What's happening at school" />
          <div className={s.noticeLayout}>
            <div>
              {notices.length > 0 ? (
                <div className={s.noticeList}>
                  {notices.map((n) => (
                    <NoticeCard key={n.id} notice={n} />
                  ))}
                </div>
              ) : (
                <div className={s.empty}>No notices right now. Please check back soon.</div>
              )}
              <div style={{ marginTop: 22 }}>
                <Link to="/notices" className={s.textLink}>
                  View all notices <SiteIcon name="arrowRight" size={17} />
                </Link>
              </div>
            </div>
            <aside className={s.admissionBox}>
              <div className={s.eyebrow}>Admissions {session}</div>
              <h3>{settings.admissionsOpen ? "Registrations are open" : "Admissions information"}</h3>
              <p>{settings.admissionNotice || "Contact the admissions office for seat availability and the admission schedule."}</p>
              <ul className={s.checkList} style={{ color: "rgba(255,255,255,0.86)" }}>
                <li>
                  <SiteIcon name="check" size={18} strokeWidth={2.4} /> Nursery to Class XI
                </li>
                <li>
                  <SiteIcon name="check" size={18} strokeWidth={2.4} /> Simple, transparent process
                </li>
                <li>
                  <SiteIcon name="check" size={18} strokeWidth={2.4} /> Campus visits on all working days
                </li>
              </ul>
              <div style={{ marginTop: 26, display: "flex", gap: 10, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
                <Link to="/admissions#enquiry" className={cx(s.btn, s.btnAccent, s.btnSm)}>
                  Enquire now
                </Link>
                <Link to="/admissions" className={cx(s.btn, s.btnGhostLight, s.btnSm)}>
                  Admission process
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className={s.section}>
        <div className={s.container}>
          <SectionHead eyebrow="Gallery" title="Life at our school" lead="Moments from classrooms, labs, playgrounds and celebrations." />
          <div className={s.galleryPreview}>
            {galleryPreview.map((g, i) => (
              <GalleryTile key={g.id} item={g} onOpen={() => setLightbox(i)} />
            ))}
          </div>
          <div className={s.sectionFoot}>
            <Link to="/gallery" className={cx(s.btn, s.btnOutline)}>
              View full gallery
            </Link>
          </div>
        </div>
        {lightbox !== null && <Lightbox items={galleryPreview} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
      </section>

      {/* Testimonials */}
      {site.testimonials.length > 0 && (
        <section className={cx(s.section, s.sectionMist)}>
          <div className={s.container}>
            <SectionHead eyebrow="Voices of our community" title="What parents and alumni say" />
            <div className={s.grid3}>
              {site.testimonials.slice(0, 3).map((t, i) => (
                <Reveal key={t.id} delay={i * 90}>
                  <TestimonialCard t={t} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBand session={session} phone={settings.phone} admissionsOpen={settings.admissionsOpen} />
    </>
  );
};

export default HomePage;
