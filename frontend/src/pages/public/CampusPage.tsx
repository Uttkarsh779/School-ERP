import { useState } from "react";
import { Link } from "react-router-dom";
import { CO_CURRICULAR, IMAGES } from "./content";
import { SiteIcon } from "./icons";
import { CtaBand, FacilityCard, GalleryTile, Lightbox, PageBanner, Reveal, SectionHead, cx } from "./parts";
import { usePageTitle, useSite } from "./useSite";
import s from "./site.module.css";

const SAFETY = [
  "CCTV coverage across the campus and in school buses",
  "Visitor register and controlled entry at the gate",
  "GPS-tracked buses with trained drivers and attendants",
  "First-aid room and regular health check-ups",
  "Fire-safety equipment and periodic evacuation drills",
  "Female staff for supervision of young children",
];

const CampusPage = () => {
  const site = useSite();
  const { settings, session } = site;
  const [lightbox, setLightbox] = useState<number | null>(null);
  usePageTitle("Campus Life", settings.schoolName);
  const strip = site.gallery.slice(0, 6);

  return (
    <>
      <PageBanner crumb="Campus Life" title="Campus Life" text="Modern facilities, a safe environment and plenty of activities beyond the classroom." image={IMAGES.sportsComplex} />

      <section className={s.section}>
        <div className={s.container}>
          <SectionHead eyebrow="Facilities" title="Our campus" lead="Thoughtfully designed spaces for learning, play and creativity." />
          {site.facilities.length > 0 ? (
            <div className={s.grid3}>
              {site.facilities.map((f, i) => (
                <Reveal key={f.id} delay={(i % 3) * 90}>
                  <FacilityCard facility={f} />
                </Reveal>
              ))}
            </div>
          ) : (
            <div className={s.empty}>Facility details will be published soon.</div>
          )}
        </div>
      </section>

      <section className={cx(s.section, s.sectionMist)}>
        <div className={s.container}>
          <SectionHead eyebrow="Beyond the classroom" title="Co-curricular activities" lead="Every child finds something they love — and learns teamwork, discipline and confidence along the way." />
          <div className={s.grid3}>
            {CO_CURRICULAR.map((c, i) => (
              <Reveal key={c.title} delay={(i % 3) * 90}>
                <article className={cx(s.card, s.cardHover)} style={{ height: "100%" }}>
                  <div className={s.cardIcon}>
                    <SiteIcon name={c.icon} size={24} />
                  </div>
                  <h3 className={s.cardTitle}>{c.title}</h3>
                  <p className={s.cardText}>{c.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={cx(s.container, s.split, s.splitReverse)}>
          <Reveal>
            <div className={s.frame}>
              <img src={IMAGES.campusHero} alt="School campus" className={s.frameImg} loading="lazy" />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <SectionHead align="left" eyebrow="Safety first" title="A campus parents can trust" />
            <ul className={s.checkList} style={{ marginTop: -20 }}>
              {SAFETY.map((p) => (
                <li key={p}>
                  <SiteIcon name="shield" size={18} />
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className={cx(s.section, s.sectionMist)}>
        <div className={s.container}>
          <SectionHead eyebrow="Glimpses" title="Around the campus" />
          <div className={s.galleryGrid}>
            {strip.map((g, i) => (
              <GalleryTile key={g.id} item={g} onOpen={() => setLightbox(i)} />
            ))}
          </div>
          <div className={s.sectionFoot}>
            <Link to="/gallery" className={cx(s.btn, s.btnOutline)}>
              Open the photo gallery
            </Link>
          </div>
        </div>
        {lightbox !== null && <Lightbox items={strip} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
      </section>

      <CtaBand session={session} phone={settings.phone} admissionsOpen={settings.admissionsOpen} />
    </>
  );
};

export default CampusPage;
