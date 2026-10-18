import { erpApi } from "./erpApi";

export interface IWebsiteSetting {
  id: number;
  schoolName: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  aboutText: string;
  principalName: string;
  principalMessage: string;
  affiliationNo: string;
  establishedYear: number;
  phone: string;
  email: string;
  address: string;
  admissionsOpen: boolean;
  admissionNotice?: string;
  heroCtaText: string;
  heroCtaLink: string;
  updatedAt?: string;
}

export interface IWebsiteFacility {
  id: number;
  title: string;
  description: string;
  iconName: string;
  imageUrl?: string | null;
  order: number;
  isActive: boolean;
}

export interface IWebsitePublicNotice {
  id: number;
  title: string;
  content: string;
  category: string;
  fileUrl?: string | null;
  isPinned: boolean;
  publishedAt: string;
  isActive: boolean;
}

export interface IPublicWebsiteData {
  settings: IWebsiteSetting;
  facilities: IWebsiteFacility[];
  notices: IWebsitePublicNotice[];
}

export interface IAdmissionInquiry {
  id: number;
  studentName: string;
  parentName: string;
  email: string;
  phone: string;
  gradeApplyingFor: string;
  currentSchool?: string;
  message?: string;
  status: "NEW" | "CONTACTED" | "ADMITTED" | "REJECTED";
  notes?: string;
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
}

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

const cmsTags = ["Cms", "Inquiry"] as const;

export const cmsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    // Public queries & mutations
    getPublicWebsiteData: builder.query<IPublicWebsiteData, void>({
      query: () => "public/website",
      transformResponse: (res: ApiEnvelope<IPublicWebsiteData>) => res.data,
      providesTags: ["Cms"],
    }),
    submitAdmissionInquiry: builder.mutation<{ message: string; inquiry: IAdmissionInquiry }, CreateInquiryInput>({
      query: (body) => ({ url: "public/inquiry", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<any>) => ({ message: res.message || "Enquiry submitted", inquiry: res.data }),
      invalidatesTags: ["Inquiry"],
    }),

    // Admin CMS queries & mutations
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

    getCmsFacilities: builder.query<IWebsiteFacility[], void>({
      query: () => "admin/cms/facilities",
      transformResponse: (res: ApiEnvelope<IWebsiteFacility[]>) => res.data,
      providesTags: ["Cms"],
    }),
    createCmsFacility: builder.mutation<IWebsiteFacility, Partial<IWebsiteFacility>>({
      query: (body) => ({ url: "admin/cms/facilities", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IWebsiteFacility>) => res.data,
      invalidatesTags: ["Cms"],
    }),
    updateCmsFacility: builder.mutation<IWebsiteFacility, { id: number; data: Partial<IWebsiteFacility> }>({
      query: ({ id, data }) => ({ url: `admin/cms/facilities/${id}`, method: "PUT", body: data }),
      transformResponse: (res: ApiEnvelope<IWebsiteFacility>) => res.data,
      invalidatesTags: ["Cms"],
    }),
    deleteCmsFacility: builder.mutation<void, number>({
      query: (id) => ({ url: `admin/cms/facilities/${id}`, method: "DELETE" }),
      invalidatesTags: ["Cms"],
    }),

    getCmsNotices: builder.query<IWebsitePublicNotice[], void>({
      query: () => "admin/cms/notices",
      transformResponse: (res: ApiEnvelope<IWebsitePublicNotice[]>) => res.data,
      providesTags: ["Cms"],
    }),
    createCmsNotice: builder.mutation<IWebsitePublicNotice, Partial<IWebsitePublicNotice>>({
      query: (body) => ({ url: "admin/cms/notices", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IWebsitePublicNotice>) => res.data,
      invalidatesTags: ["Cms"],
    }),
    updateCmsNotice: builder.mutation<IWebsitePublicNotice, { id: number; data: Partial<IWebsitePublicNotice> }>({
      query: ({ id, data }) => ({ url: `admin/cms/notices/${id}`, method: "PUT", body: data }),
      transformResponse: (res: ApiEnvelope<IWebsitePublicNotice>) => res.data,
      invalidatesTags: ["Cms"],
    }),
    deleteCmsNotice: builder.mutation<void, number>({
      query: (id) => ({ url: `admin/cms/notices/${id}`, method: "DELETE" }),
      invalidatesTags: ["Cms"],
    }),

    getAdmissionInquiries: builder.query<IAdmissionInquiry[], string | void>({
      query: (status) => ({
        url: "admin/cms/inquiries",
        params: status && status !== "ALL" ? { status } : undefined,
      }),
      transformResponse: (res: ApiEnvelope<IAdmissionInquiry[]>) => res.data,
      providesTags: ["Inquiry"],
    }),
    updateInquiryStatus: builder.mutation<IAdmissionInquiry, { id: number; status: string; notes?: string }>({
      query: ({ id, status, notes }) => ({
        url: `admin/cms/inquiries/${id}`,
        method: "PATCH",
        body: { status, notes },
      }),
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
  useGetCmsFacilitiesQuery,
  useCreateCmsFacilityMutation,
  useUpdateCmsFacilityMutation,
  useDeleteCmsFacilityMutation,
  useGetCmsNoticesQuery,
  useCreateCmsNoticeMutation,
  useUpdateCmsNoticeMutation,
  useDeleteCmsNoticeMutation,
  useGetAdmissionInquiriesQuery,
  useUpdateInquiryStatusMutation,
} = cmsApi;
