'use client';

import React from "react"

import { useState } from 'react';
import { X, Upload, CheckCircle } from 'lucide-react';

interface FileUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpload?: (file: File) => void;
}

export function FileUploadModal({
    isOpen,
    onClose,
    onUpload,
}: FileUploadModalProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileSelect = (file: File) => {
        setSelectedFile(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    };

    const handleUpload = () => {
        if (selectedFile && onUpload) {
            onUpload(selectedFile);
            setSelectedFile(null);
            onClose();
        }
    };

    const handleCancel = () => {
        setSelectedFile(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg bg-card shadow-lg border border-border">
                <div className="flex items-center justify-between border-b border-border p-6">
                    <h2 className="text-lg font-semibold text-foreground">Upload File</h2>
                    <button
                        onClick={handleCancel}
                        className="rounded-lg p-1 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragging
                                ? 'border-primary bg-primary/10'
                                : 'border-border bg-secondary hover:border-primary/50'
                            }`}
                    >
                        <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
                        <p className="font-medium text-foreground">Drag your file here</p>
                        <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                    </div>

                    <input
                        id="file-input"
                        type="file"
                        onChange={(e) => {
                            const files = e.currentTarget.files;
                            if (files && files.length > 0) {
                                handleFileSelect(files[0]);
                            }
                        }}
                        className="hidden"
                    />

                    <label
                        htmlFor="file-input"
                        className="block w-full px-4 py-2 border border-border rounded-lg text-center font-medium text-foreground hover:bg-secondary transition-colors cursor-pointer"
                    >
                        Choose File
                    </label>

                    {selectedFile && (
                        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-emerald-900">File selected</p>
                                <p className="text-xs text-emerald-700 truncate">{selectedFile.name}</p>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={handleCancel}
                            className="flex-1 px-4 py-2 border border-border rounded-lg text-foreground font-medium hover:bg-secondary transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={!selectedFile}
                            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Upload
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
