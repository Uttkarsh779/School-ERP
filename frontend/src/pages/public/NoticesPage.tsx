import { useMemo, useState } from "react";
import { IMAGES } from "./content";
import { SiteIcon } from "./icons";
import { NoticeCard, PageBanner, cx } from "./parts";
import { usePageTitle, useSite } from "./useSite";
import s from "./site.module.css";

const NoticesPage = () => {
  const { settings, notices, isLoading } = useSite();
  const [category, setCategory] = useState("All");
  const [q, setQ] = useState("");
  usePageTitle("Notices & Circulars", settings.schoolName);

  const categories = useMemo(() => ["All", ...Array.from(new Set(notices.map((n) => n.category)))], [notices]);
  const term = q.trim().toLowerCase();
  const list = notices.filter(
    (n) => (category === "All" || n.category === category) && (!term || n.title.toLowerCase().includes(term) || n.content.toLowerCase().includes(term))
  );

  return (
    <>
      <PageBanner crumb="Notices" title="Notices & Circulars" text="Announcements, events and important updates for parents and students." image={IMAGES.library} />

      <section className={s.section}>
        <div className={s.container} style={{ maxWidth: 920 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
            <div className={s.filters} style={{ margin: 0, justifyContent: "flex-start" }}>
              {categories.map((c) => (
                <button key={c} type="button" className={cx(s.filterBtn, category === c && s.filterBtnActive)} onClick={() => setCategory(c)} aria-pressed={category === c}>
                  {c}
                </button>
              ))}
            </div>
            <label style={{ position: "relative", flex: "1 1 220px", maxWidth: 300 }}>
              <span className="sr-only" style={{ position: "absolute", left: -9999 }}>
                Search notices
              </span>
              <input className={s.input} placeholder="Search notices…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 14 }} />
            </label>
          </div>

          {isLoading ? (
            <div style={{ display: "grid", gap: 14 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className={s.skeleton} style={{ height: 110 }} />
              ))}
            </div>
          ) : list.length > 0 ? (
            <div className={s.noticeList}>
              {list.map((n) => (
                <NoticeCard key={n.id} notice={n} />
              ))}
            </div>
          ) : (
            <div className={s.empty}>
              <SiteIcon name="bell" size={30} style={{ margin: "0 auto 10px", color: "var(--muted)" }} />
              {notices.length === 0 ? "No notices have been published yet." : "No notices match your search."}
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default NoticesPage;
