import { erpApi } from "./erpApi";

export interface IWebsiteStat {
  value: string;
  label: string;
}

export interface IWebsiteSetting {
  id: number;
  schoolName: string;
  tagline: string;
  boardName: string;
  affiliationNo: string;
  schoolCode?: string | null;
  establishedYear: number;
  academicSession?: string | null;
  logoUrl?: string | null;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaText: string;
  heroCtaLink: string;
  heroImageUrl?: string | null;
  admissionsOpen: boolean;
  admissionNotice?: string | null;
  aboutText: string;
  aboutImageUrl?: string | null;
  vision?: string | null;
  mission?: string | null;
  principalName: string;
  principalTitle: string;
  principalMessage: string;
  principalPhotoUrl?: string | null;
  phone: string;
  whatsapp?: string | null;
  email: string;
  address: string;
  officeHours?: string | null;
  mapEmbedUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  twitterUrl?: string | null;
  stats?: IWebsiteStat[] | null;
  updatedAt?: string;
}

interface CmsItemBase {
  id: number;
  isActive: boolean;
  createdAt?: string;
}

export interface IWebsiteFacility extends CmsItemBase {
  title: string;
  description: string;
  iconName: string;
  imageUrl?: string | null;
  order: number;
}

export interface IWebsiteGalleryItem extends CmsItemBase {
  title: string;
  category: string;
  imageUrl: string;
  description?: string | null;
  order: number;
}

export interface IWebsitePublicNotice extends CmsItemBase {
  title: string;
  content: string;
  category: string;
  fileUrl?: string | null;
  isPinned: boolean;
  publishedAt: string;
}

export interface IWebsiteTestimonial extends CmsItemBase {
  name: string;
  relation?: string | null;
  quote: string;
  photoUrl?: string | null;
  order: number;
}

export interface IWebsiteFaq extends CmsItemBase {
  question: string;
  answer: string;
  order: number;
}

export interface CmsCollections {
  facilities: IWebsiteFacility;
  gallery: IWebsiteGalleryItem;
  notices: IWebsitePublicNotice;
  testimonials: IWebsiteTestimonial;
  faqs: IWebsiteFaq;
}
export type CmsCollectionName = keyof CmsCollections;
export type CmsAnyItem = CmsCollections[CmsCollectionName];

export interface IPublicWebsiteData {
  settings: IWebsiteSetting;
  facilities: IWebsiteFacility[];
  notices: IWebsitePublicNotice[];
  gallery: IWebsiteGalleryItem[];
  testimonials: IWebsiteTestimonial[];
  faqs: IWebsiteFaq[];
}

export type InquiryStatus = "NEW" | "CONTACTED" | "ADMITTED" | "REJECTED";

export interface IAdmissionInquiry {
  id: number;
  studentName: string;
  parentName: string;
  email: string;
  phone: string;
  gradeApplyingFor: string;
  currentSchool?: string | null;
  message?: string | null;
  status: InquiryStatus;
  notes?: string | null;
  createdAt: string;
}

export interface CreateInquiryInput {
  studentName: string;
  parentName: string;
  email?: string;
  phone: string;
  gradeApplyingFor: string;
  currentSchool?: string;
  message?: string;
  website?: string; // honeypot — always empty for real visitors
}

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export const cmsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    // Public
    getPublicWebsiteData: builder.query<IPublicWebsiteData, void>({
      query: () => "public/website",
      transformResponse: (res: ApiEnvelope<IPublicWebsiteData>) => res.data,
      providesTags: ["Cms"],
    }),
    submitAdmissionInquiry: builder.mutation<{ message: string }, CreateInquiryInput>({
      query: (body) => ({ url: "public/inquiry", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<unknown>) => ({ message: res.message || "Enquiry submitted" }),
      invalidatesTags: ["Inquiry"],
    }),

    // Admin: settings
    getCmsSettings: builder.query<IWebsiteSetting, void>({
      query: () => "admin/cms/settings",
      transformResponse: (res: ApiEnvelope<IWebsiteSetting>) => res.data,
      providesTags: ["Cms"],
    }),
    updateCmsSettings: builder.mutation<IWebsiteSetting, Partial<IWebsiteSetting>>({
      query: (body) => ({ url: "admin/cms/settings", method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<IWebsiteSetting>) => res.data,
      invalidatesTags: ["Cms"],
    }),

    // Admin: content collections
    getCmsCollection: builder.query<CmsAnyItem[], CmsCollectionName>({
      query: (name) => `admin/cms/${name}`,
      transformResponse: (res: ApiEnvelope<CmsAnyItem[]>) => res.data,
      providesTags: ["Cms"],
    }),
    createCmsItem: builder.mutation<CmsAnyItem, { collection: CmsCollectionName; data: Record<string, unknown> }>({
      query: ({ collection, data }) => ({ url: `admin/cms/${collection}`, method: "POST", body: data }),
      transformResponse: (res: ApiEnvelope<CmsAnyItem>) => res.data,
      invalidatesTags: ["Cms"],
    }),
    updateCmsItem: builder.mutation<CmsAnyItem, { collection: CmsCollectionName; id: number; data: Record<string, unknown> }>({
      query: ({ collection, id, data }) => ({ url: `admin/cms/${collection}/${id}`, method: "PUT", body: data }),
      transformResponse: (res: ApiEnvelope<CmsAnyItem>) => res.data,
      invalidatesTags: ["Cms"],
    }),
    deleteCmsItem: builder.mutation<void, { collection: CmsCollectionName; id: number }>({
      query: ({ collection, id }) => ({ url: `admin/cms/${collection}/${id}`, method: "DELETE" }),
      invalidatesTags: ["Cms"],
    }),

    // Admin: admission enquiries
    getAdmissionInquiries: builder.query<IAdmissionInquiry[], string | void>({
      query: (status) => ({
        url: "admin/cms/inquiries",
        params: status && status !== "ALL" ? { status } : undefined,
      }),
      transformResponse: (res: ApiEnvelope<IAdmissionInquiry[]>) => res.data,
      providesTags: ["Inquiry"],
    }),
    updateInquiryStatus: builder.mutation<IAdmissionInquiry, { id: number; status: InquiryStatus; notes?: string }>({
      query: ({ id, status, notes }) => ({ url: `admin/cms/inquiries/${id}`, method: "PATCH", body: { status, notes } }),
      transformResponse: (res: ApiEnvelope<IAdmissionInquiry>) => res.data,
      invalidatesTags: ["Inquiry"],
    }),
  }),
});

export const {
  useGetPublicWebsiteDataQuery,
  useSubmitAdmissionInquiryMutation,
  useGetCmsSettingsQuery,
  useUpdateCmsSettingsMutation,
  useGetCmsCollectionQuery,
  useCreateCmsItemMutation,
  useUpdateCmsItemMutation,
  useDeleteCmsItemMutation,
  useGetAdmissionInquiriesQuery,
  useUpdateInquiryStatusMutation,
} = cmsApi;
