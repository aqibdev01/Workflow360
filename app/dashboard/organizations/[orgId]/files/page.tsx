"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  Upload,
  LayoutGrid,
  List,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBreadcrumbs } from "@/components/breadcrumbs";
import { useFileManager, type SortBy } from "@/hooks/useFileManager";
import { useFileUpload } from "@/hooks/useFileUpload";
import { FolderSidebar, type VirtualFolder } from "@/components/files/FolderSidebar";
import { FileBreadcrumb } from "@/components/files/FileBreadcrumb";
import { CreateFolderDialog } from "@/components/files/CreateFolderDialog";
import { FileGrid } from "@/components/files/FileGrid";
import { UploadZone, UploadProgressPanel } from "@/components/files/UploadZone";
import { BulkActionToolbar, MoveToFolderDialog } from "@/components/files/FileContextMenu";
import { FilePreviewModal } from "@/components/files/FilePreviewModal";
import { ShareFileDialog } from "@/components/files/ShareFileDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  downloadFile,
  deleteFile,
  renameFile,
  moveFile,
  starFile,
  unstarFile,
  getStarredFiles,
  type FileRecord,
} from "@/lib/files/files";
import {
  renameFolder as renameFolderApi,
  deleteFolder as deleteFolderApi,
  updateFolderColor,
} from "@/lib/files/folders";
import { getFilesSharedWithMe } from "@/lib/files/sharing";

// =====================================================
// Main Page
// =====================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function OrgFilesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  const { user } = useAuth();

  // Guard against non-UUID route params (e.g. /organizations/new/files)
  useEffect(() => {
    if (!UUID_RE.test(orgId)) {
      router.replace("/dashboard/organizations");
    }
  }, [orgId, router]);

  useBreadcrumbs([
    { label: "Organizations", href: "/dashboard/organizations" },
    { label: "Files" },
  ]);

  const fileManager = useFileManager({ orgId });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Virtual folder state
  const [activeVirtualFolder, setActiveVirtualFolder] = useState<VirtualFolder | null>(null);
  const [virtualFiles, setVirtualFiles] = useState<FileRecord[]>([]);
  const [virtualLoading, setVirtualLoading] = useState(false);

  // Dialogs
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; type: "file" | "folder" } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: "file" | "folder" } | null>(null);
  const [colorDialogOpen, setColorDialogOpen] = useState(false);
  const [colorTarget, setColorTarget] = useState<string | null>(null);

  // New dialogs
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    const fileIdFromQuery = searchParams.get("file");
    if (fileIdFromQuery) {
      setPreviewFileId(fileIdFromQuery);
      setPreviewOpen(true);
    }
  }, [searchParams]);
  const [shareFile, setShareFileTarget] = useState<FileRecord | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<FileRecord | null>(null);

  // Upload hook
  const fileUpload = useFileUpload({
    orgId,
    folderId: fileManager.currentFolderId || undefined,
    onFileUploaded: () => fileManager.actions.refresh(),
    onAllComplete: () => toast.success("All uploads complete"),
  });

  // Active files
  const displayFiles = activeVirtualFolder ? virtualFiles : fileManager.files;
  const displayLoading = activeVirtualFolder ? virtualLoading : fileManager.loading;

  // =====================================================
  // Virtual Folder Handlers
  // =====================================================

  const handleVirtualFolderSelect = useCallback(
    async (vf: VirtualFolder) => {
      setActiveVirtualFolder(vf);
      fileManager.actions.navigateToFolder(null);
      setVirtualLoading(true);

      try {
        if (vf === "all") {
          setVirtualFiles([]);
          setActiveVirtualFolder(null);
          return;
        }
        if (vf === "starred") {
          const starred = await getStarredFiles(orgId);
          setVirtualFiles(starred);
        } else if (vf === "shared") {
          const shared = await getFilesSharedWithMe(orgId);
          setVirtualFiles(shared.map((s) => ({ ...s.file } as any)));
        } else if (vf === "recent") {
          setVirtualFiles(fileManager.files.slice(0, 20));
        }
      } catch (err: any) {
        toast.error("Failed to load files", { description: err.message });
        setVirtualFiles([]);
      } finally {
        setVirtualLoading(false);
      }
    },
    [orgId, fileManager.files]
  );

  const handleNavigateToFolder = useCallback(
    (folderId: string | null) => {
      setActiveVirtualFolder(null);
      setVirtualFiles([]);
      fileManager.actions.navigateToFolder(folderId);
    },
    [fileManager.actions]
  );

  // =====================================================
  // File Actions
  // =====================================================

  const handleFileUploadClick = () => fileInputRef.current?.click();

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      fileUpload.addFiles(Array.from(e.target.files));
    }
    e.target.value = "";
  };

  const handleDownload = async (fileId: string) => {
    try {
      await downloadFile(fileId);
    } catch (err: any) {
      toast.error("Download failed", { description: err.message });
    }
  };

  const handleToggleStar = async (fileId: string, isStarred: boolean) => {
    try {
      if (isStarred) {
        await unstarFile(fileId);
        toast.success("Removed from starred");
      } else {
        await starFile(fileId);
        toast.success("Added to starred");
      }
      fileManager.actions.refresh();
    } catch (err: any) {
      toast.error("Failed", { description: err.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "file") {
        await deleteFile(deleteTarget.id);
        toast.success("File deleted");
      } else {
        await deleteFolderApi(deleteTarget.id);
        toast.success("Folder deleted");
      }
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      fileManager.actions.refresh();
    } catch (err: any) {
      toast.error("Delete failed", { description: err.message });
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      if (renameTarget.type === "file") {
        await renameFile(renameTarget.id, renameValue.trim());
      } else {
        await renameFolderApi(renameTarget.id, renameValue.trim());
      }
      toast.success("Renamed successfully");
      setRenameDialogOpen(false);
      setRenameTarget(null);
      fileManager.actions.refresh();
    } catch (err: any) {
      toast.error("Rename failed", { description: err.message });
    }
  };

  const handleColorChange = async (color: string | null) => {
    if (!colorTarget) return;
    try {
      await updateFolderColor(colorTarget, color);
      toast.success("Folder color updated");
      setColorDialogOpen(false);
      setColorTarget(null);
      fileManager.actions.refresh();
    } catch (err: any) {
      toast.error("Failed to update color", { description: err.message });
    }
  };

  const handleMoveFile = async (targetFolderId: string | null) => {
    if (!moveTarget) return;
    try {
      await moveFile(moveTarget.id, targetFolderId);
      toast.success("File moved");
      setMoveDialogOpen(false);
      setMoveTarget(null);
      fileManager.actions.refresh();
    } catch (err: any) {
      toast.error("Move failed", { description: err.message });
    }
  };

  // Bulk actions
  const handleBulkDownload = async () => {
    for (const fileId of fileManager.selectedFiles) {
      await handleDownload(fileId);
    }
  };

  const handleBulkDelete = async () => {
    const count = fileManager.selectedFiles.size;
    for (const fileId of fileManager.selectedFiles) {
      try {
        await deleteFile(fileId);
      } catch {
        // Continue with others
      }
    }
    toast.success(`${count} file(s) deleted`);
    fileManager.actions.clearSelection();
    fileManager.actions.refresh();
  };

  const handleBulkMove = () => {
    // For bulk move, we'll use the first selected file as reference
    const firstId = Array.from(fileManager.selectedFiles)[0];
    const file = displayFiles.find((f) => f.id === firstId);
    if (file) {
      setMoveTarget(file);
      setMoveDialogOpen(true);
    }
  };

  // =====================================================
  // Folder sidebar callbacks
  // =====================================================

  const openCreateFolder = (parentId?: string) => {
    setCreateFolderParentId(parentId || null);
    setCreateFolderOpen(true);
  };

  const openRenameFolder = (folderId: string, name: string) => {
    setRenameTarget({ id: folderId, name, type: "folder" });
    setRenameValue(name);
    setRenameDialogOpen(true);
  };

  const openDeleteFolder = (folderId: string) => {
    const folder = fileManager.flatFolders.find((f) => f.id === folderId);
    setDeleteTarget({ id: folderId, name: folder?.name || "Folder", type: "folder" });
    setDeleteConfirmOpen(true);
  };

  const openColorDialog = (folderId: string) => {
    setColorTarget(folderId);
    setColorDialogOpen(true);
  };

  // =====================================================
  // Render
  // =====================================================

  const virtualFolderLabels: Record<VirtualFolder, string> = {
    all: "All Files",
    starred: "Starred Files",
    recent: "Recent Files",
    shared: "Shared with Me",
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] -mx-4 lg:-mx-6 -mb-4 lg:-mb-6 bg-white dark:bg-slate-950 rounded-t-xl border dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Sidebar */}
      <FolderSidebar
        orgId={orgId}
        folderTree={fileManager.folderTree}
        currentFolderId={fileManager.currentFolderId}
        activeVirtualFolder={activeVirtualFolder}
        onNavigateToFolder={handleNavigateToFolder}
        onVirtualFolderSelect={handleVirtualFolderSelect}
        onCreateFolder={openCreateFolder}
        onRenameFolder={openRenameFolder}
        onDeleteFolder={openDeleteFolder}
        onChangeColor={openColorDialog}
        onShareFolder={(folderId) => {
          const folderFiles = fileManager.files.filter((f: any) => f.folder_id === folderId);
          if (folderFiles.length > 0) {
            setShareFileTarget(folderFiles[0]);
            setShareOpen(true);
          }
        }}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            {activeVirtualFolder ? (
              <h2 className="text-sm font-semibold text-foreground">
                {virtualFolderLabels[activeVirtualFolder]}
              </h2>
            ) : (
              <FileBreadcrumb
                folderPath={fileManager.folderPath}
                rootLabel="Org Files"
                onNavigate={handleNavigateToFolder}
              />
            )}
          </div>

          {/* Search */}
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search files..."
              value={fileManager.searchQuery}
              onChange={(e) => fileManager.actions.setSearchQuery(e.target.value)}
            />
          </div>

          {/* View mode toggle */}
          <div className="flex border rounded-md">
            <Button
              variant={fileManager.viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => fileManager.actions.setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={fileManager.viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => fileManager.actions.setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Upload button */}
          <Button size="sm" className="h-8 gap-1.5" onClick={handleFileUploadClick}>
            <Upload className="h-4 w-4" />
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFilesSelected}
          />
        </div>

        {/* Bulk action toolbar */}
        <BulkActionToolbar
          selectedCount={fileManager.selectedFiles.size}
          onMove={handleBulkMove}
          onDownload={handleBulkDownload}
          onDelete={handleBulkDelete}
          onClearSelection={fileManager.actions.clearSelection}
        />

        {/* Drag-and-drop upload zone wraps content area */}
        <UploadZone
          onFilesDropped={(files) => fileUpload.addFiles(files)}
          disabled={fileUpload.isUploading}
        >
          <div className="flex-1 overflow-y-auto p-4">
            {displayLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <>
                <FileGrid
                  files={displayFiles}
                  subfolders={activeVirtualFolder ? [] : fileManager.currentSubfolders}
                  viewMode={fileManager.viewMode}
                  starredIds={fileManager.starredIds}
                  selectedFiles={fileManager.selectedFiles}
                  sortBy={fileManager.sortBy}
                  sortOrder={fileManager.sortOrder}
                  onSelectFile={fileManager.actions.selectFile}
                  onOpenFile={(file) => {
                    setPreviewFileId(file.id);
                    setPreviewOpen(true);
                  }}
                  onDownload={handleDownload}
                  onRename={(file) => {
                    setRenameTarget({ id: file.id, name: file.name, type: "file" });
                    setRenameValue(file.name);
                    setRenameDialogOpen(true);
                  }}
                  onMove={(file) => {
                    setMoveTarget(file);
                    setMoveDialogOpen(true);
                  }}
                  onShare={(file) => {
                    setShareFileTarget(file);
                    setShareOpen(true);
                  }}
                  onVersionHistory={(file) => {
                    setPreviewFileId(file.id);
                    setPreviewOpen(true);
                  }}
                  onToggleStar={handleToggleStar}
                  onDelete={(file) => {
                    setDeleteTarget({ id: file.id, name: file.name, type: "file" });
                    setDeleteConfirmOpen(true);
                  }}
                  onNavigateToFolder={(folderId) => handleNavigateToFolder(folderId)}
                  onSortByChange={fileManager.actions.setSortBy}
                  onSortOrderChange={fileManager.actions.setSortOrder}
                  onCreateFolder={() => openCreateFolder()}
                  onUploadFiles={handleFileUploadClick}
                  isVirtualFolder={!!activeVirtualFolder}
                  emptyLabel={
                    activeVirtualFolder
                      ? `No ${virtualFolderLabels[activeVirtualFolder].toLowerCase()}`
                      : undefined
                  }
                />

                {/* Pagination */}
                {fileManager.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                    <span>
                      Page {fileManager.page} of {fileManager.totalPages} ({fileManager.totalFiles} files)
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={fileManager.page <= 1}
                        onClick={() => fileManager.actions.setPage(fileManager.page - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={fileManager.page >= fileManager.totalPages}
                        onClick={() => fileManager.actions.setPage(fileManager.page + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </UploadZone>
      </div>

      {/* ==================== Dialogs ==================== */}

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        orgId={orgId}
        parentFolderId={createFolderParentId}
        onFolderCreated={() => fileManager.actions.refresh()}
      />

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.type === "file" ? "File" : "Folder"}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.type === "file" ? "File" : "Folder"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;?
              {deleteTarget?.type === "file"
                ? " The file will be archived and can be recovered."
                : " The folder must be empty to delete."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Color Picker Dialog */}
      <Dialog open={colorDialogOpen} onOpenChange={setColorDialogOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Folder Color</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 flex-wrap justify-center py-4">
            <button
              className="h-10 w-10 rounded-full border-2 border-muted flex items-center justify-center hover:border-foreground transition-colors text-xs"
              onClick={() => handleColorChange(null)}
            >
              None
            </button>
            {["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#84CC16"].map(
              (c) => (
                <button
                  key={c}
                  className="h-10 w-10 rounded-full border-2 border-transparent hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  onClick={() => handleColorChange(c)}
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* File Preview Modal */}
      <FilePreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        fileId={previewFileId}
        onShare={(file) => {
          setShareFileTarget(file);
          setShareOpen(true);
        }}
        onFileUpdated={() => fileManager.actions.refresh()}
      />

      {/* Share File Dialog */}
      <ShareFileDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        file={shareFile}
        orgId={orgId}
      />

      {/* Move to Folder Dialog */}
      <MoveToFolderDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        folders={fileManager.flatFolders}
        currentFolderId={fileManager.currentFolderId}
        targetLabel={moveTarget?.name || "file"}
        onMove={handleMoveFile}
      />

      {/* Upload Progress Panel (fixed bottom-right) */}
      <UploadProgressPanel
        queue={fileUpload.queue}
        onClearCompleted={fileUpload.clearCompleted}
        onRetryItem={fileUpload.retryItem}
        onRemoveItem={fileUpload.removeFromQueue}
        onClearAll={fileUpload.clearAll}
        isUploading={fileUpload.isUploading}
        completedCount={fileUpload.completedCount}
        errorCount={fileUpload.errorCount}
        totalCount={fileUpload.totalCount}
      />
    </div>
  );
}
