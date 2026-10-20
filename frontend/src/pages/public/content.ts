import campusHero from "../../assets/images/campus_hero.jpg";
import stemLab from "../../assets/images/stem_lab.jpg";
import sportsComplex from "../../assets/images/sports_complex.jpg";
import library from "../../assets/images/library.jpg";
import auditorium from "../../assets/images/auditorium.jpg";
import smartClassroom from "../../assets/images/smart_classroom.jpg";
import principal from "../../assets/images/principal.jpg";
import type { IWebsiteGalleryItem } from "../../store/api/cms.api";
import type { SiteIconName } from "./icons";

// Built-in images and copy for the public website. Anything the school manages from the
// CMS (settings, facilities, gallery, notices, testimonials, FAQs) overrides these.

export const IMAGES = { campusHero, stemLab, sportsComplex, library, auditorium, smartClassroom, principal };

// Shown until the school uploads its own photos in Website CMS → Gallery.
export const FALLBACK_GALLERY: IWebsiteGalleryItem[] = [
  { id: -1, title: "Our campus", category: "Campus", imageUrl: campusHero, description: "Green, open and safe — designed around the way children learn.", order: 1, isActive: true },
  { id: -2, title: "Science & STEM lab", category: "Academics", imageUrl: stemLab, description: "Hands-on experiments in physics, chemistry, biology and robotics.", order: 2, isActive: true },
  { id: -3, title: "Smart classrooms", category: "Academics", imageUrl: smartClassroom, description: "Interactive panels and bright, airy classrooms.", order: 3, isActive: true },
  { id: -4, title: "Sports ground", category: "Sports", imageUrl: sportsComplex, description: "Athletics, football, cricket and court games with trained coaches.", order: 4, isActive: true },
  { id: -5, title: "Library", category: "Campus", imageUrl: library, description: "A quiet space for reading, research and discovery.", order: 5, isActive: true },
  { id: -6, title: "Auditorium", category: "Events", imageUrl: auditorium, description: "Annual day, assemblies, competitions and celebrations.", order: 6, isActive: true },
];

export interface AcademicStage {
  key: string;
  name: string;
  classes: string;
  ages: string;
  icon: SiteIconName;
  summary: string;
  points: string[];
}

export const ACADEMIC_STAGES: AcademicStage[] = [
  {
    key: "pre-primary",
    name: "Pre-Primary",
    classes: "Nursery · LKG · UKG",
    ages: "Ages 3–6",
    icon: "heart",
    summary: "A warm, play-based start where children build language, number sense and confidence through stories, songs and activities.",
    points: ["Play-way & activity-based learning", "Phonics and early reading", "Fine and gross motor skills", "Caring, trained teachers"],
  },
  {
    key: "primary",
    name: "Primary",
    classes: "Classes I – V",
    ages: "Ages 6–11",
    icon: "book",
    summary: "Strong foundations in reading, writing, mathematics and environmental studies, with plenty of room for curiosity and creativity.",
    points: ["English, Hindi, Mathematics, EVS", "Computer basics from Class I", "Art, music, dance & PE every week", "Continuous, stress-free assessment"],
  },
  {
    key: "middle",
    name: "Middle School",
    classes: "Classes VI – VIII",
    ages: "Ages 11–14",
    icon: "flask",
    summary: "Subject specialists introduce science, social science and a third language, while projects and labs develop reasoning skills.",
    points: ["Science & social science labs", "Third language (Sanskrit)", "Clubs, olympiads & quizzes", "Life skills and value education"],
  },
  {
    key: "secondary",
    name: "Secondary",
    classes: "Classes IX – X",
    ages: "Ages 14–16",
    icon: "target",
    summary: "Focused board preparation with regular practice tests, doubt-clearing sessions and personal mentoring for every student.",
    points: ["Board-pattern practice tests", "Remedial & enrichment classes", "Career awareness sessions", "Individual mentoring"],
  },
  {
    key: "senior-secondary",
    name: "Senior Secondary",
    classes: "Classes XI – XII",
    ages: "Ages 16–18",
    icon: "graduation",
    summary: "Streams in Science, Commerce and Humanities, guided by experienced faculty and support for competitive exams and college choices.",
    points: ["Science (PCM / PCB)", "Commerce with Maths / IP", "Humanities", "Career & college counselling"],
  },
];

export const CORE_VALUES: { icon: SiteIconName; title: string; text: string }[] = [
  { icon: "award", title: "Excellence", text: "High expectations in academics, sports and the arts — and the support to meet them." },
  { icon: "heart", title: "Care", text: "Every child is known, valued and looked after in a safe, friendly environment." },
  { icon: "shield", title: "Integrity", text: "Honesty, discipline and respect are part of every day at school." },
  { icon: "globe", title: "Curiosity", text: "We encourage questions, experiments and new ideas inside and outside the classroom." },
];

export const WHY_CHOOSE: { icon: SiteIconName; title: string; text: string }[] = [
  { icon: "users", title: "Experienced teachers", text: "Qualified, caring faculty who know each student personally." },
  { icon: "shield", title: "Safe campus", text: "CCTV, trained staff, secure entry and GPS-tracked transport." },
  { icon: "trophy", title: "All-round growth", text: "Sports, music, art, clubs and competitions alongside academics." },
  { icon: "dashboard", title: "Parent connect", text: "Attendance, homework, results and fees online in the school portal." },
];

export const CO_CURRICULAR: { icon: SiteIconName; title: string; text: string }[] = [
  { icon: "trophy", title: "Sports & Games", text: "Athletics, cricket, football, kabaddi, kho-kho, basketball, badminton, chess and yoga." },
  { icon: "music", title: "Music & Dance", text: "Vocal and instrumental music, classical and folk dance, and the school band." },
  { icon: "palette", title: "Art & Craft", text: "Drawing, painting, clay modelling and craft — with exhibitions every year." },
  { icon: "flask", title: "Clubs", text: "Science, eco, literary, quiz, maths and computer clubs that meet every week." },
  { icon: "megaphone", title: "Public Speaking", text: "Debates, elocution, assemblies and drama to build confidence on stage." },
  { icon: "leaf", title: "Community & Environment", text: "Tree plantation, cleanliness drives and visits that build social responsibility." },
];

export const ASSESSMENT: { title: string; text: string }[] = [
  { title: "Periodic tests", text: "Short, regular tests that track progress without pressure." },
  { title: "Half-yearly & annual exams", text: "Term examinations following the board pattern and syllabus." },
  { title: "Projects & activities", text: "Practical work, projects and presentations count towards results." },
  { title: "Report cards", text: "Detailed report cards with co-scholastic grades, shared online with parents." },
];

export const ADMISSION_STEPS: { title: string; text: string }[] = [
  { title: "Send an enquiry", text: "Fill in the online enquiry form or call the admissions office." },
  { title: "Visit the campus", text: "Meet our team, see the classrooms and collect the registration form." },
  { title: "Register", text: "Submit the completed form with the required documents." },
  { title: "Interaction", text: "A friendly interaction with the child (assessment for Class II onwards)." },
  { title: "Confirm admission", text: "Receive the admission offer and complete the fee formalities." },
];

export const ADMISSION_DOCUMENTS = [
  "Birth certificate of the child",
  "Aadhaar card of the child and both parents",
  "4 recent passport-size photographs of the child",
  "Report card of the previous class (Class II onwards)",
  "Transfer Certificate from the previous school (Class II onwards)",
  "Caste / category certificate, if applicable",
  "Address proof (electricity bill, ration card or rent agreement)",
];

export const AGE_CRITERIA: { grade: string; age: string }[] = [
  { grade: "Nursery", age: "3+ years" },
  { grade: "LKG", age: "4+ years" },
  { grade: "UKG", age: "5+ years" },
  { grade: "Class I", age: "6+ years" },
  { grade: "Classes II – IX", age: "As per previous class & TC" },
  { grade: "Class XI", age: "After passing Class X" },
];

export const GRADES = [
  "Nursery",
  "LKG",
  "UKG",
  "Class I",
  "Class II",
  "Class III",
  "Class IV",
  "Class V",
  "Class VI",
  "Class VII",
  "Class VIII",
  "Class IX",
  "Class XI – Science",
  "Class XI – Commerce",
  "Class XI – Humanities",
];
