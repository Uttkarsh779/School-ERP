import campusHero from "../../assets/images/campus_hero.jpg";
import stemLab from "../../assets/images/stem_lab.jpg";
import sportsComplex from "../../assets/images/sports_complex.jpg";
import library from "../../assets/images/library.jpg";
import auditorium from "../../assets/images/auditorium.jpg";
import smartClassroom from "../../assets/images/smart_classroom.jpg";

export interface GalleryItem {
  id: number;
  title: string;
  category: "Campus" | "Academics" | "Sports" | "Arts";
  imageUrl: string;
  description: string;
  date?: string;
}

export const GALLERY_ITEMS: GalleryItem[] = [
  {
    id: 1,
    title: "Main Campus Architecture & Green Grounds",
    category: "Campus",
    imageUrl: campusHero,
    description: "Our 25-acre green eco-campus featuring modern academic blocks, manicured lawns, and tree-lined walkways.",
    date: "Academic Year 2026",
  },
  {
    id: 2,
    title: "Advanced STEM, AI & Robotics Laboratory",
    category: "Academics",
    imageUrl: stemLab,
    description: "Young innovators collaborating on automated robotics, 3D printing prototyping, and experimental physics.",
    date: "National Innovation Expo",
  },
  {
    id: 3,
    title: "Olympic-Standard Athletics Arena & Turf",
    category: "Sports",
    imageUrl: sportsComplex,
    description: "Dedicated FIFA-standard football turf, 400m synthetic running track, and multisport stadium courts.",
    date: "Annual Sports Meet",
  },
  {
    id: 4,
    title: "Two-Story Central Digital Library",
    category: "Campus",
    imageUrl: library,
    description: "Over 15,000 physical volumes, digital archives, and serene sunlit study pods for active researchers.",
    date: "Scholastic Resource Center",
  },
  {
    id: 5,
    title: "Performing Arts Auditorium & Symphony Hall",
    category: "Arts",
    imageUrl: auditorium,
    description: "Acoustically treated 1,200-seat auditorium hosting student orchestras, drama plays, and annual cultural celebrations.",
    date: "Inter-School Cultural Fest",
  },
  {
    id: 6,
    title: "Interactive Smart Digital Classrooms",
    category: "Academics",
    imageUrl: smartClassroom,
    description: "Collaborative learning environments equipped with interactive digital smart boards and multimedia learning modules.",
    date: "Interactive Visual Learning",
  },
];

export const galleryItems = GALLERY_ITEMS;

