import { CORE_VALUES, IMAGES } from "./content";
import { SiteIcon } from "./icons";
import { CtaBand, PageBanner, Reveal, SectionHead, cx } from "./parts";
import { usePageTitle, useSite } from "./useSite";
import s from "./site.module.css";

const AboutPage = () => {
  const site = useSite();
  const { settings, session } = site;
  usePageTitle("About Us", settings.schoolName);

  const vision = settings.vision || "To nurture confident, compassionate and curious learners who are ready to lead in a changing world while staying rooted in strong values.";
  const mission =
    settings.mission ||
    "To provide a safe, joyful and inclusive environment; to deliver strong academics through dedicated teachers and modern methods; and to develop every child's talents in sports, arts and community service.";

  const facts = [
    { label: "Board", value: settings.boardName },
    { label: "Affiliation No.", value: settings.affiliationNo },
    { label: "School Code", value: settings.schoolCode },
    { label: "Established", value: String(settings.establishedYear) },
    { label: "Classes", value: "Nursery – XII" },
    { label: "Current session", value: session },
  ].filter((f) => f.value);

  return (
    <>
      <PageBanner crumb="About" title={`About ${settings.schoolName}`} text={settings.tagline} image={IMAGES.campusHero} />

      <section className={s.section}>
        <div className={cx(s.container, s.split)}>
          <Reveal>
            <SectionHead align="left" eyebrow="Our story" title={`Educating young minds since ${settings.establishedYear}`} />
            <div className={s.prose} style={{ marginTop: -24 }}>
              <p>{settings.aboutText}</p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className={s.frame}>
              <img src={site.aboutImage} alt={`${settings.schoolName} campus`} className={s.frameImg} loading="lazy" />
              <div className={s.frameBadge}>
                <span className={s.frameBadgeValue}>{site.years}+</span>
                <span className={s.frameBadgeLabel}>
                  Years of
                  <br />
                  excellence
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className={cx(s.section, s.sectionMist)}>
        <div className={s.container}>
          <div className={s.grid2}>
            <Reveal>
              <article className={s.card} style={{ height: "100%" }}>
                <div className={s.cardIcon}>
                  <SiteIcon name="eye" size={24} />
                </div>
                <h2 className={s.sectionTitle} style={{ fontSize: "1.7rem", marginBottom: 12 }}>
                  Our vision
                </h2>
                <p className={s.prose}>{vision}</p>
              </article>
            </Reveal>
            <Reveal delay={100}>
              <article className={s.card} style={{ height: "100%" }}>
                <div className={s.cardIcon}>
                  <SiteIcon name="target" size={24} />
                </div>
                <h2 className={s.sectionTitle} style={{ fontSize: "1.7rem", marginBottom: 12 }}>
                  Our mission
                </h2>
                <p className={s.prose}>{mission}</p>
              </article>
            </Reveal>
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.container}>
          <SectionHead eyebrow="What we believe" title="Our core values" lead="The values that guide our teachers, our students and every decision we make." />
          <div className={s.grid4}>
            {CORE_VALUES.map((v, i) => (
              <Reveal key={v.title} delay={i * 80}>
                <article className={cx(s.card, s.cardHover)} style={{ height: "100%", textAlign: "center" }}>
                  <div className={s.cardIcon} style={{ margin: "0 auto 18px" }}>
                    <SiteIcon name={v.icon} size={24} />
                  </div>
                  <h3 className={s.cardTitle}>{v.title}</h3>
                  <p className={s.cardText}>{v.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {settings.principalMessage && (
        <section className={cx(s.section, s.sectionMist)} id="principal">
          <div className={cx(s.container, s.principal)}>
            <Reveal>
              <img src={site.principalPhoto} alt={settings.principalName} className={s.principalPhoto} loading="lazy" />
            </Reveal>
            <Reveal delay={120}>
              <div className={s.eyebrow}>{settings.principalTitle}'s message</div>
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

      <section className={s.section} id="disclosure">
        <div className={s.container}>
          <SectionHead eyebrow="School at a glance" title="Key information" />
          <div className={s.factGrid}>
            {facts.map((f) => (
              <div key={f.label} className={s.fact}>
                <div className={s.factLabel}>{f.label}</div>
                <div className={s.factValue}>{f.value}</div>
              </div>
            ))}
            {settings.address && (
              <div className={s.fact} style={{ gridColumn: "1 / -1" }}>
                <div className={s.factLabel}>Address</div>
                <div className={s.factValue}>{settings.address}</div>
              </div>
            )}
          </div>
        </div>
      </section>

      <CtaBand session={session} phone={settings.phone} admissionsOpen={settings.admissionsOpen} />
    </>
  );
};

export default AboutPage;
