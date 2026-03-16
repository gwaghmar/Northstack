"""
Cloud Storage service module
Handles file uploads and storage operations
"""

import logging
import asyncio
from pathlib import Path
from typing import Optional

try:
    from google.cloud import storage
except Exception:  # pragma: no cover
    storage = None

logger = logging.getLogger(__name__)


class CloudStorageService:
    """Manages Google Cloud Storage operations"""
    
    def __init__(self, bucket_name: str):
        """
        Initialize Cloud Storage service
        
        Args:
            bucket_name: GCS bucket name
        """
        self.bucket_name = bucket_name
        self._client = None
        self._bucket = None

        backend_root = Path(__file__).resolve().parents[1]
        self._local_recordings_dir = backend_root / "data" / "recordings"
        self._local_recordings_dir.mkdir(parents=True, exist_ok=True)

        self._initialize_storage_client()
        mode = "gcs" if self._bucket is not None else "local-files-fallback"
        logger.info(
            "CloudStorageService initialized with bucket: %s (mode=%s)",
            bucket_name,
            mode,
        )

    def _initialize_storage_client(self) -> None:
        if storage is None or not self.bucket_name:
            if storage is None:
                logger.warning("google-cloud-storage not available; using local fallback")
            return

        try:
            self._client = storage.Client()
            self._bucket = self._client.bucket(self.bucket_name)
        except Exception as e:
            logger.warning("Failed to initialize GCS client: %s", e)
            self._client = None
            self._bucket = None

    def _upload_sync(self, user_id: str, session_id: str, audio_data: bytes) -> Optional[str]:
        object_path = f"sessions/{user_id}/{session_id}.wav"

        if self._bucket is not None:
            blob = self._bucket.blob(object_path)
            blob.upload_from_string(audio_data, content_type="audio/wav")
            return f"gs://{self.bucket_name}/{object_path}"

        local_path = self._local_recordings_dir / user_id
        local_path.mkdir(parents=True, exist_ok=True)
        file_path = local_path / f"{session_id}.wav"
        file_path.write_bytes(audio_data)
        return str(file_path)
    
    def _list_files_sync(self, prefix: str = "") -> list:
        if self._bucket is not None:
            blobs = self._client.list_blobs(self.bucket_name, prefix=prefix or "data/samples/")
            return [
                {
                    "name": blob.name,
                    "size": blob.size,
                    "updated": blob.updated.isoformat() if blob.updated else None,
                    "source": "gcs",
                }
                for blob in blobs
            ]
        # Local fallback: list files in data/samples/
        samples_dir = Path(__file__).resolve().parents[1] / "data" / "samples"
        if not samples_dir.exists():
            return []
        return [
            {"name": f.name, "size": f.stat().st_size, "updated": None, "source": "local"}
            for f in sorted(samples_dir.iterdir())
            if f.is_file()
        ]

    async def list_files(self, prefix: str = "") -> list:
        try:
            return await asyncio.to_thread(self._list_files_sync, prefix)
        except Exception as e:
            logger.error(f"Error listing files: {e}")
            return []

    def _read_file_sync(self, filename: str) -> Optional[str]:
        if self._bucket is not None:
            blob = self._bucket.blob(filename)
            return blob.download_as_text()
        # Local fallback — restrict to data/samples/ to avoid path traversal
        samples_dir = Path(__file__).resolve().parents[1] / "data" / "samples"
        file_path = (samples_dir / Path(filename).name).resolve()
        if not str(file_path).startswith(str(samples_dir.resolve())):
            return None
        if file_path.exists():
            return file_path.read_text(encoding="utf-8")
        return None

    async def read_file(self, filename: str) -> Optional[str]:
        try:
            return await asyncio.to_thread(self._read_file_sync, filename)
        except Exception as e:
            logger.error(f"Error reading file: {e}")
            return None

    async def upload_session_recording(self, user_id: str, session_id: str, audio_data: bytes) -> Optional[str]:
        """
        Upload session recording to Cloud Storage
        
        Args:
            user_id: User ID
            session_id: Session ID
            audio_data: Audio bytes to upload
            
        Returns:
            Optional[str]: Public URL of uploaded file
        """
        try:
            url = await asyncio.to_thread(self._upload_sync, user_id, session_id, audio_data)
            logger.info(f"Recording uploaded for user {user_id}, session {session_id}")
            return url
        except Exception as e:
            logger.error(f"Error uploading recording: {e}")
            return None
