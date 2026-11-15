import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface MyProfile {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  memberSince: string;
  photoUrl: string | null;
  canEditDetails: boolean;
  canEditPhoto: boolean;
  staff: {
    id: number;
    staffCategory: string;
    contact: string | null;
    qualifications: string | null;
    address: string | null;
    employeeCode: string | null;
    joiningDate: string | null;
    dob: string | null;
    bloodGroup: string | null;
    emergencyContact: string | null;
    classTeacherOf: string[];
    teaches: string[];
  } | null;
  student: { id: number; admissionNo: string; classSection: string | null } | null;
}

export type ProfileUpdate = Partial<{
  name: string;
  contact: string | null;
  qualifications: string | null;
  address: string | null;
  photoUrl: string | null;
}>;

export const profileApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getMyProfile: builder.query<MyProfile, void>({
      query: () => "profile/me",
      transformResponse: (res: ApiEnvelope<MyProfile>) => res.data,
      providesTags: ["Profile"],
    }),
    updateMyProfile: builder.mutation<MyProfile, ProfileUpdate>({
      query: (body) => ({ url: "profile/me", method: "PATCH", body }),
      transformResponse: (res: ApiEnvelope<MyProfile>) => res.data,
      invalidatesTags: ["Profile", "Staff"],
    }),
    // Signs out other devices; the response carries fresh tokens for this one.
    changePassword: builder.mutation<{ success: boolean; data: { accessToken: string; refreshToken: string } }, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: "profile/change-password", method: "POST", body }),
    }),
  }),
});

export const { useGetMyProfileQuery, useUpdateMyProfileMutation, useChangePasswordMutation } = profileApi;
