import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  useSubmitAdmissionInquiryMutation,
  type IWebsiteFacility,
  type IWebsiteFaq,
  type IWebsiteGalleryItem,
  type IWebsitePublicNotice,
  type IWebsiteTestimonial,
} from "../../store/api/cms.api";
import { GRADES, IMAGES } from "./content";
import { SiteIcon, facilityIcon } from "./icons";
import { isInternalLink, telHref } from "./useSite";
import s from "./site.module.css";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");
export { cx };

// ---------- Reveal on scroll ----------
export const Reveal = ({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -60px 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={cx(s.reveal, shown && s.revealed, className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
};

// ---------- Links that may be internal routes or external URLs ----------
export const SmartLink = ({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) =>
  isInternalLink(href) ? (
    <Link to={href} className={className}>
      {children}
    </Link>
  ) : (
    <a
      href={href}
      className={className}
      {...(/^https?:/.test(href)
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      {children}
    </a>
  );

// ---------- Headings ----------
export const SectionHead = ({
  eyebrow,
  title,
  lead,
  align = "center",
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "center" | "left";
}) => (
  <div className={cx(s.sectionHead, align === "left" && s.sectionHeadLeft)}>
    {eyebrow && <div className={s.eyebrow}>{eyebrow}</div>}
    <h2 className={s.sectionTitle}>{title}</h2>
    {lead && <p className={s.sectionLead}>{lead}</p>}
  </div>
);

export const PageBanner = ({
  title,
  text,
  image,
  crumb,
}: {
  title: string;
  text?: string;
  image?: string;
  crumb: string;
}) => (
  <section className={s.banner}>
    <img src={image ?? IMAGES.campusHero} alt="" className={s.bannerBg} />
    <div className={s.container}>
      <ol className={s.crumbs} aria-label="Breadcrumb">
        <li>
          <Link to="/">Home</Link>
        </li>
        <li aria-hidden="true">
          <SiteIcon name="chevronRight" size={14} />
        </li>
        <li aria-current="page">{crumb}</li>
      </ol>
      <h1 className={s.bannerTitle}>{title}</h1>
      {text && <p className={s.bannerText}>{text}</p>}
    </div>
  </section>
);

// ---------- Notices ----------
export const NoticeCard = ({
  notice,
  expandable = true,
}: {
  notice: IWebsitePublicNotice;
  expandable?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const d = new Date(notice.publishedAt);
  const long = notice.content.length > 160;
  return (
    <article className={cx(s.notice, notice.isPinned && s.noticePinned)}>
      <div className={s.dateTile} aria-hidden="true">
        <div className={s.dateDay}>{d.getDate()}</div>
        <div className={s.dateMonth}>
          {d.toLocaleDateString("en-IN", { month: "short" })}
        </div>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className={s.stageMeta}>
          <span className={s.chip}>{notice.category}</span>
          {notice.isPinned && (
            <span className={cx(s.chip, s.chipAccent)}>Important</span>
          )}
        </div>
        <h3 className={s.noticeTitle}>{notice.title}</h3>
        <p className={cx(s.noticeText, !open && s.noticeClamp)}>
          {notice.content}
        </p>
        {((expandable && long) || notice.fileUrl) && (
          <div className={s.noticeFoot}>
            {expandable && long && (
              <button
                type="button"
                className={s.noticeBtn}
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
              >
                {open ? "Show less" : "Read more"}
                <SiteIcon
                  name="chevronDown"
                  size={15}
                  style={{ transform: open ? "rotate(180deg)" : undefined }}
                />
              </button>
            )}
            {notice.fileUrl && (
              <a
                href={notice.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={s.noticeBtn}
              >
                <SiteIcon name="download" size={15} /> Attachment
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

// ---------- Facilities ----------
// Until the school uploads a photo, pick a matching built-in one by icon.
const FACILITY_FALLBACK: Record<string, string> = {
  building: IMAGES.smartClassroom,
  layers: IMAGES.stemLab,
  globe: IMAGES.stemLab,
  graduationCap: IMAGES.library,
  star: IMAGES.sportsComplex,
  dashboard: IMAGES.sportsComplex,
  users: IMAGES.auditorium,
  calendar: IMAGES.auditorium,
  bus: IMAGES.campusHero,
};

export const FacilityCard = ({ facility }: { facility: IWebsiteFacility }) => {
  const img = facility.imageUrl || FACILITY_FALLBACK[facility.iconName];
  return (
    <article className={s.facility}>
      {img ? (
        <img
          src={img}
          alt={facility.title}
          className={s.facilityImg}
          loading="lazy"
        />
      ) : (
        <div className={s.facilityNoImg}>
          <SiteIcon
            name={facilityIcon(facility.iconName)}
            size={46}
            strokeWidth={1.4}
          />
        </div>
      )}
      <div className={s.facilityBody}>
        <div className={s.facilityIcon}>
          <SiteIcon name={facilityIcon(facility.iconName)} size={22} />
        </div>
        <div>
          <h3 className={s.cardTitle}>{facility.title}</h3>
          <p className={s.cardText}>{facility.description}</p>
        </div>
      </div>
    </article>
  );
};

// ---------- Gallery + lightbox ----------
export const Lightbox = ({
  items,
  index,
  onClose,
  onIndex,
}: {
  items: IWebsiteGalleryItem[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) => {
  const item = items[index];
  const go = useCallback(
    (delta: number) => onIndex((index + delta + items.length) % items.length),
    [index, items.length, onIndex],
  );
  const closeRef = useRef<HTMLButtonElement>(null);
  // Horizontal swipe on touch screens steps through photos.
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX.current === null || items.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!item) return null;
  return (
    <div
      className={s.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <span className={s.lightboxCount}>
        {index + 1} / {items.length}
      </span>
      <button
        ref={closeRef}
        type="button"
        className={cx(s.lightboxBtn, s.lightboxClose)}
        onClick={onClose}
        aria-label="Close"
      >
        <SiteIcon name="close" size={22} />
      </button>
      {items.length > 1 && (
        <>
          <button
            type="button"
            className={cx(s.lightboxBtn, s.lightboxPrev)}
            onClick={(e) => (e.stopPropagation(), go(-1))}
            aria-label="Previous photo"
          >
            <SiteIcon name="chevronLeft" size={24} />
          </button>
          <button
            type="button"
            className={cx(s.lightboxBtn, s.lightboxNext)}
            onClick={(e) => (e.stopPropagation(), go(1))}
            aria-label="Next photo"
          >
            <SiteIcon name="chevronRight" size={24} />
          </button>
        </>
      )}
      <figure className={s.lightboxFigure} onClick={(e) => e.stopPropagation()}>
        <img src={item.imageUrl} alt={item.title} />
        <figcaption>
          <strong>{item.title}</strong>
          {item.description}
        </figcaption>
      </figure>
    </div>
  );
};

export const GalleryTile = ({
  item,
  onOpen,
}: {
  item: IWebsiteGalleryItem;
  onOpen: () => void;
}) => (
  <button
    type="button"
    className={s.galleryItem}
    onClick={onOpen}
    aria-label={`Open photo: ${item.title}`}
  >
    <img src={item.imageUrl} alt={item.title} loading="lazy" />
    <span className={s.galleryCaption}>
      <small>{item.category}</small>
      {item.title}
    </span>
  </button>
);

// ---------- Testimonials ----------
export const TestimonialCard = ({ t }: { t: IWebsiteTestimonial }) => (
  <figure className={s.testimonial} style={{ margin: 0 }}>
    <SiteIcon
      name="quote"
      size={30}
      className={s.quoteMark}
      strokeWidth={2.2}
    />
    <blockquote className={s.testimonialQuote} style={{ margin: 0 }}>
      {t.quote}
    </blockquote>
    <figcaption className={s.person}>
      {t.photoUrl ? (
        <img src={t.photoUrl} alt="" className={s.avatar} />
      ) : (
        <span className={s.avatar}>{t.name.replace(/^(mr|mrs|ms|miss|dr|shri|smt)\.?\s+/i, "").charAt(0)}</span>
      )}
      <span>
        <span className={s.personName} style={{ display: "block" }}>
          {t.name}
        </span>
        {t.relation && <span className={s.personRole}>{t.relation}</span>}
      </span>
    </figcaption>
  </figure>
);

// ---------- FAQ ----------
export const FaqList = ({ faqs }: { faqs: IWebsiteFaq[] }) => (
  <div className={s.faqList}>
    {faqs.map((f, i) => (
      <details key={f.id} className={s.faq} open={i === 0}>
        <summary>
          {f.question}
          <SiteIcon name="chevronDown" size={20} />
        </summary>
        <div className={s.faqAnswer}>{f.answer}</div>
      </details>
    ))}
  </div>
);

// ---------- CTA band ----------
export const CtaBand = ({
  session,
  phone,
  admissionsOpen,
}: {
  session: string;
  phone?: string;
  admissionsOpen: boolean;
}) => (
  <section className={s.sectionTight}>
    <div className={s.container}>
      <Reveal>
        <div className={s.ctaBand}>
          <div>
            <h2>
              {admissionsOpen
                ? `Admissions open for ${session}`
                : "Come and see our school"}
            </h2>
            <p>
              Visit the campus, meet our teachers and see why families trust us
              with their children's future.
            </p>
          </div>
          <div className={s.ctaActions}>
            <Link to="/admissions#enquiry" className={cx(s.btn, s.btnPrimary)}>
              Send an enquiry <SiteIcon name="arrowRight" size={18} />
            </Link>
            {phone && (
              <a href={telHref(phone)} className={cx(s.btn, s.btnOutline)}>
                <SiteIcon name="phone" size={17} /> Call us
              </a>
            )}
          </div>
        </div>
      </Reveal>
    </div>
  </section>
);

// ---------- Admission enquiry form ----------
const EMPTY_FORM = {
  studentName: "",
  parentName: "",
  phone: "",
  email: "",
  gradeApplyingFor: "",
  currentSchool: "",
  message: "",
  website: "",
};

export const EnquiryForm = ({ session }: { session: string }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [submit, { isLoading }] = useSubmitAdmissionInquiryMutation();
  const set =
    (k: keyof typeof EMPTY_FORM) => (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.studentName.trim().length < 2 || form.parentName.trim().length < 2)
      return setError("Please enter the student's and parent's names.");
    if (!/^[+]?[\d\s-]{7,15}$/.test(form.phone.trim()))
      return setError("Please enter a valid mobile number.");
    if (!form.gradeApplyingFor)
      return setError("Please choose the class you are applying for.");
    try {
      const res = await submit({
        ...form,
        studentName: form.studentName.trim(),
        parentName: form.parentName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        currentSchool: form.currentSchool.trim() || undefined,
        message: form.message.trim() || undefined,
      }).unwrap();
      setDone(res.message);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(
        (err as { data?: { message?: string } })?.data?.message ??
          "Couldn't send your enquiry. Please try again or call the school office.",
      );
    }
  };

  if (done) {
    return (
      <div className={s.formCard}>
        <div className={s.formSuccess} role="status">
          <div className={s.successIcon}>
            <SiteIcon name="check" size={32} strokeWidth={2.4} />
          </div>
          <h3 className={s.cardTitle} style={{ fontSize: "1.3rem" }}>
            Enquiry received
          </h3>
          <p className={s.cardText}>{done}</p>
          <button
            type="button"
            className={cx(s.btn, s.btnOutline, s.btnSm)}
            style={{ marginTop: 20 }}
            onClick={() => setDone(null)}
          >
            Send another enquiry
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className={s.formCard} onSubmit={onSubmit} noValidate>
      <h3
        className={s.cardTitle}
        style={{ fontSize: "1.35rem", fontFamily: "var(--serif)" }}
      >
        Admission enquiry · {session}
      </h3>
      <p className={s.cardText} style={{ marginBottom: 22 }}>
        Share a few details and our admissions team will call you back.
      </p>
      <div className={s.formGrid}>
        <label className={s.field}>
          <span className={s.fieldLabel}>
            Student's name <span>*</span>
          </span>
          <input
            className={s.input}
            value={form.studentName}
            onChange={set("studentName")}
            autoComplete="off"
            maxLength={80}
            required
          />
        </label>
        <label className={s.field}>
          <span className={s.fieldLabel}>
            Class applying for <span>*</span>
          </span>
          <select
            className={s.input}
            value={form.gradeApplyingFor}
            onChange={set("gradeApplyingFor")}
            required
          >
            <option value="">Select class</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          <span className={s.fieldLabel}>
            Parent's name <span>*</span>
          </span>
          <input
            className={s.input}
            value={form.parentName}
            onChange={set("parentName")}
            autoComplete="name"
            maxLength={80}
            required
          />
        </label>
        <label className={s.field}>
          <span className={s.fieldLabel}>
            Mobile number <span>*</span>
          </span>
          <input
            className={s.input}
            type="tel"
            value={form.phone}
            onChange={set("phone")}
            autoComplete="tel"
            maxLength={15}
            required
          />
        </label>
        <label className={s.field}>
          <span className={s.fieldLabel}>Email</span>
          <input
            className={s.input}
            type="email"
            value={form.email}
            onChange={set("email")}
            autoComplete="email"
            maxLength={120}
          />
        </label>
        <label className={s.field}>
          <span className={s.fieldLabel}>Current school</span>
          <input
            className={s.input}
            value={form.currentSchool}
            onChange={set("currentSchool")}
            maxLength={120}
          />
        </label>
        <label className={cx(s.field, s.fieldFull)}>
          <span className={s.fieldLabel}>Message</span>
          <textarea
            className={s.input}
            value={form.message}
            onChange={set("message")}
            maxLength={1000}
            placeholder="Any questions about admissions, transport or fees?"
          />
        </label>
        <label className={s.honeypot} aria-hidden="true">
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={set("website")}
          />
        </label>
      </div>
      {error && (
        <p
          role="alert"
          style={{
            color: "#b42318",
            fontWeight: 600,
            fontSize: "0.9rem",
            marginTop: 14,
          }}
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        className={cx(s.btn, s.btnPrimary)}
        style={{ marginTop: 20, width: "100%" }}
        disabled={isLoading}
      >
        {isLoading ? "Sending…" : "Send enquiry"}
        {!isLoading && <SiteIcon name="arrowRight" size={18} />}
      </button>
      <p className={s.formNote}>
        We use these details only to contact you about admission.
      </p>
    </form>
  );
};
