import { ACADEMIC_STAGES, ASSESSMENT, IMAGES } from "./content";
import { SiteIcon } from "./icons";
import { CtaBand, PageBanner, Reveal, SectionHead, cx } from "./parts";
import { usePageTitle, useSite } from "./useSite";
import s from "./site.module.css";

const STREAMS = [
  { name: "Science (PCM)", subjects: "Physics, Chemistry, Mathematics, English + one elective (Computer Science / Physical Education)" },
  { name: "Science (PCB)", subjects: "Physics, Chemistry, Biology, English + one elective (Mathematics / Physical Education)" },
  { name: "Commerce", subjects: "Accountancy, Business Studies, Economics, English + Mathematics / Informatics Practices" },
  { name: "Humanities", subjects: "History, Political Science, Geography / Economics, English + one elective" },
];

const AcademicsPage = () => {
  const { settings, session } = useSite();
  usePageTitle("Academics", settings.schoolName);

  return (
    <>
      <PageBanner
        crumb="Academics"
        title="Academics"
        text={`A ${settings.boardName} curriculum delivered with care — strong concepts, regular practice and plenty of hands-on learning.`}
        image={IMAGES.smartClassroom}
      />

      <section className={s.section}>
        <div className={s.container}>
          <SectionHead eyebrow="Learning stages" title="From Nursery to Class XII" lead="Each stage builds on the last, so children move ahead with confidence." />
          <div style={{ display: "grid", gap: 22 }}>
            {ACADEMIC_STAGES.map((st, i) => (
              <Reveal key={st.key} delay={60}>
                <article className={cx(s.card, s.stageRow)} id={st.key} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "start" }}>
                  <div className={s.cardIcon} style={{ marginBottom: 0, width: 60, height: 60, background: i % 2 ? "var(--accent-100)" : undefined, color: i % 2 ? "var(--accent-600)" : undefined }}>
                    <SiteIcon name={st.icon} size={28} />
                  </div>
                  <div>
                    <div className={s.stageMeta}>
                      <span className={s.chip}>{st.classes}</span>
                      <span className={cx(s.chip, s.chipAccent)}>{st.ages}</span>
                    </div>
                    <h3 className={s.cardTitle} style={{ fontSize: "1.3rem", fontFamily: "var(--serif)" }}>
                      {st.name}
                    </h3>
                    <p className={s.cardText}>{st.summary}</p>
                    <ul className={s.checkList} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                      {st.points.map((p) => (
                        <li key={p}>
                          <SiteIcon name="check" size={17} strokeWidth={2.4} />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className={cx(s.section, s.sectionMist)} id="streams">
        <div className={s.container}>
          <SectionHead eyebrow="Classes XI – XII" title="Streams offered" lead="Students choose their stream after Class X based on interest, aptitude and results, with guidance from our counsellors." />
          <div className={s.grid2}>
            {STREAMS.map((st, i) => (
              <Reveal key={st.name} delay={(i % 2) * 90}>
                <article className={cx(s.card, s.cardHover)} style={{ height: "100%" }}>
                  <h3 className={s.cardTitle}>{st.name}</h3>
                  <p className={s.cardText}>{st.subjects}</p>
                </article>
              </Reveal>
            ))}
          </div>
          <p className={s.formNote} style={{ textAlign: "center", marginTop: 20 }}>
            Subject combinations depend on the number of students opting and may change each year.
          </p>
        </div>
      </section>

      <section className={s.section}>
        <div className={cx(s.container, s.split)}>
          <Reveal>
            <SectionHead align="left" eyebrow="Teaching approach" title="How we teach" />
            <ul className={s.checkList} style={{ marginTop: -20 }}>
              {[
                "Concept-first teaching with real-life examples and activities",
                "Smart classrooms, labs and library periods built into the timetable",
                "Small groups for remedial support and extra challenge",
                "Homework that practises — not burdens — shared online with parents",
                "Regular parent–teacher meetings and online progress reports",
              ].map((p) => (
                <li key={p}>
                  <SiteIcon name="check" size={18} strokeWidth={2.4} />
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <div className={s.frame}>
              <img src={IMAGES.stemLab} alt="Students in the science lab" className={s.frameImg} loading="lazy" />
            </div>
          </Reveal>
        </div>
      </section>

      <section className={cx(s.section, s.sectionMist)}>
        <div className={s.container}>
          <SectionHead eyebrow="Assessment" title="Fair, continuous evaluation" lead={`Assessment follows ${settings.boardName} guidelines and focuses on steady progress rather than one-time exams.`} />
          <div className={s.grid4}>
            {ASSESSMENT.map((a, i) => (
              <Reveal key={a.title} delay={i * 80}>
                <div className={s.card} style={{ height: "100%", borderTop: "3px solid var(--brand-600)" }}>
                  <h3 className={s.cardTitle}>
                    {a.title}
                  </h3>
                  <p className={s.cardText}>{a.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand session={session} phone={settings.phone} admissionsOpen={settings.admissionsOpen} />
    </>
  );
};

export default AcademicsPage;
