/**
 * React hooks for file uploads
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  deleteUploadedFile,
  listPersistedUploadedFiles,
  listUploadedFiles,
  uploadFiles,
  type UploadedFileInfo,
  type UploadResponse,
} from "./api";

/**
 * Hook to upload files
 */
export function useUploadFiles(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation<UploadResponse, Error, File[]>({
    mutationFn: (files: File[]) => uploadFiles(threadId, files),
    onSuccess: () => {
      // Invalidate the uploaded files list
      void queryClient.invalidateQueries({
        queryKey: ["uploads", "list", threadId],
      });
    },
  });
}

/**
 * Hook to list uploaded files
 */
export function useUploadedFiles(threadId: string) {
  return useQuery({
    queryKey: ["uploads", "list", threadId],
    queryFn: async () => {
      try {
        const persisted = await listPersistedUploadedFiles(threadId);
        if (persisted.uploads.length > 0) {
          return {
            files: persisted.uploads.map((upload) => ({
              filename: upload.filename,
              size: upload.sizeBytes ? Number(upload.sizeBytes) : 0,
              path: upload.path,
              virtual_path: upload.path,
              artifact_url: "",
              mimeType: upload.mimeType ?? undefined,
              createdAt: upload.createdAt,
            })) satisfies UploadedFileInfo[],
            count: persisted.uploads.length,
          };
        }
      } catch {
        // Fall back to the original filesystem listing for compatibility.
      }

      return listUploadedFiles(threadId);
    },
    enabled: !!threadId,
  });
}

/**
 * Hook to delete an uploaded file
 */
export function useDeleteUploadedFile(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (filename: string) => deleteUploadedFile(threadId, filename),
    onSuccess: () => {
      // Invalidate the uploaded files list
      void queryClient.invalidateQueries({
        queryKey: ["uploads", "list", threadId],
      });
    },
  });
}

/**
 * Hook to handle file uploads in submit flow
 * Returns a function that uploads files and returns their info
 */
export function useUploadFilesOnSubmit(threadId: string) {
  const uploadMutation = useUploadFiles(threadId);

  return useCallback(
    async (files: File[]): Promise<UploadedFileInfo[]> => {
      if (files.length === 0) {
        return [];
      }

      const result = await uploadMutation.mutateAsync(files);
      return result.files;
    },
    [uploadMutation],
  );
}
