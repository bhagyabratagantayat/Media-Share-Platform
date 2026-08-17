import { ConsentStatus, FaceProfileStatus, FaceJobType, FaceJobStatus, FaceFailureType, EventCategory, MediaType } from '@prisma/client';

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceLandmarks {
  leftEye: [number, number];
  rightEye: [number, number];
  noseTip: [number, number];
  mouthLeft: [number, number];
  mouthRight: [number, number];
}

export interface DetectedFace {
  boundingBox: FaceBoundingBox;
  confidence: number;
  landmarks?: FaceLandmarks;
  qualityScore: number;
  isFrontal: boolean;
}

export interface DetectionResult {
  faceCount: number;
  faces: DetectedFace[];
  imageWidth: number;
  imageHeight: number;
  qualityIssues?: string[];
}

export interface FaceEmbeddingResult {
  modelVersion: string;
  dimension: number;
  embedding: number[]; // 128-dimensional normalized unit vector
}

export interface UserFaceProfileStatusDTO {
  enabled: boolean;
  consentStatus: ConsentStatus;
  consentVersion: string;
  consentedAt?: string;
  profileStatus: FaceProfileStatus;
  profileVersion: number;
  createdAt?: string;
  updatedAt?: string;
  canSearch: boolean;
  failureReason?: string;
}

export interface FaceSearchMatchDTO {
  mediaId: string;
  mediaType: MediaType;
  thumbnailUrl: string;
  previewUrl?: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  albumId?: string;
  albumName?: string;
  albumSlug?: string;
  createdAt: string;
  matchConfidenceCategory: 'High Confidence' | 'Likely Match';
}

export interface FaceSearchResultDTO {
  items: FaceSearchMatchDTO[];
  totalMatches: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface OrganisationFaceSettingsDTO {
  faceDiscoveryEnabled: boolean;
  allowFaceDiscoveryForMinors: boolean;
  faceProfileRetentionDays: number;
  temporaryFaceDataRetentionMinutes: number;
  facePrivacyPolicyUrl: string | null;
  facePrivacyContactEmail: string | null;
  faceConsentVersion: string;
}

export interface OrganisationFaceStatsDTO {
  faceDiscoveryEnabled: boolean;
  eligibleEventsCount: number;
  totalIndexedFaces: number;
  totalIndexedMedia: number;
  activeUserProfilesCount: number;
  pendingJobsCount: number;
  failedJobsCount: number;
}

export interface BiometricThreatModel {
  threat: string;
  impact: string;
  mitigation: string;
  residualRisk: string;
}
