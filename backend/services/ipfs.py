"""
IPFS/Pinata integration for immutable rubric storage.

Rubrics are uploaded to Pinata (IPFS) and the content hash is stored on-chain.
This ensures rubrics are immutable and verifiable across the protocol.

Requires:
  PINATA_API_KEY — from https://app.pinata.cloud/keys
  PINATA_API_SECRET — from https://app.pinata.cloud/keys
"""

import json
import logging
import os
from typing import Optional

import requests

import config

logger = logging.getLogger(__name__)

PINATA_API_URL = "https://api.pinata.cloud"

class PinataClient:
    """Upload and retrieve files from Pinata (IPFS gateway)."""

    def __init__(self):
        self.api_key = os.getenv("PINATA_API_KEY", "")
        self.api_secret = os.getenv("PINATA_API_SECRET", "")
        self.enabled = bool(self.api_key and self.api_secret)

        if not self.enabled:
            logger.warning("Pinata not configured. Rubrics will be stored locally.")
        else:
            logger.info("Pinata IPFS integration enabled")

    def upload_rubric(self, bounty_id: int, rubric_data: dict) -> Optional[str]:
        """
        Upload a rubric to Pinata and return the IPFS content hash (CID).

        Args:
            bounty_id: Bounty ID (for naming/reference)
            rubric_data: Rubric dict (criteria, metadata, etc.)

        Returns:
            IPFS CID (hash) on success, None if Pinata disabled or failed
        """
        if not self.enabled:
            return None

        try:
            # Prepare JSON payload
            json_data = json.dumps(rubric_data, indent=2).encode('utf-8')

            # Prepare files for multipart upload
            files = {
                'file': (f'bounty_{bounty_id}_rubric.json', json_data, 'application/json'),
            }

            # Pinata metadata
            metadata = {
                'name': f'Agonaut Rubric #{bounty_id}',
                'keyvalues': {
                    'bounty_id': str(bounty_id),
                    'type': 'agonaut_rubric',
                },
            }

            headers = {
                'pinata_api_key': self.api_key,
                'pinata_secret_api_key': self.api_secret,
            }

            # Upload
            response = requests.post(
                f"{PINATA_API_URL}/pinning/pinFileToIPFS",
                files=files,
                data={'pinataMetadata': json.dumps(metadata)},
                headers=headers,
                timeout=30,
            )

            if response.status_code != 200:
                logger.error(
                    f"Pinata upload failed for bounty {bounty_id}: "
                    f"{response.status_code} {response.text}"
                )
                return None

            cid = response.json()['IpfsHash']
            logger.info(f"Rubric #{bounty_id} uploaded to IPFS: {cid}")
            return cid

        except Exception as e:
            logger.error(f"Pinata upload error for bounty {bounty_id}: {e}")
            return None

    def upload_json(self, name: str, data: dict) -> Optional[str]:
        """Upload arbitrary JSON to Pinata. Returns CID or None."""
        if not self.enabled:
            return None
        try:
            json_data = json.dumps(data, indent=2).encode("utf-8")
            files = {"file": (f"{name}.json", json_data, "application/json")}
            metadata = {"name": name, "keyvalues": {"type": "agonaut_metadata"}}
            headers = {"pinata_api_key": self.api_key, "pinata_secret_api_key": self.api_secret}
            response = requests.post(
                f"{PINATA_API_URL}/pinning/pinFileToIPFS",
                files=files,
                data={"pinataMetadata": json.dumps(metadata)},
                headers=headers,
                timeout=30,
            )
            if response.status_code != 200:
                logger.error(f"Pinata upload failed for {name}: {response.status_code}")
                return None
            cid = response.json()["IpfsHash"]
            logger.info(f"Uploaded {name} to IPFS: {cid}")
            return cid
        except Exception as e:
            logger.error(f"Pinata upload error for {name}: {e}")
            return None

    def retrieve_rubric(self, cid: str) -> Optional[dict]:
        """
        Retrieve a rubric from IPFS via a public gateway.

        Args:
            cid: IPFS content hash

        Returns:
            Rubric dict on success, None on failure
        """
        if not cid:
            return None

        try:
            # Use Pinata's public gateway
            url = f"https://gateway.pinata.cloud/ipfs/{cid}"
            response = requests.get(url, timeout=10)

            if response.status_code != 200:
                logger.error(f"Failed to retrieve CID {cid}: {response.status_code}")
                return None

            return response.json()

        except Exception as e:
            logger.error(f"IPFS retrieval error for CID {cid}: {e}")
            return None

    def verify_rubric_hash(self, cid: str, expected_content: dict) -> bool:
        """
        Verify that a CID matches expected rubric content.

        In a real scenario, you'd compute the hash client-side and compare.
        For now, this just checks if the CID is valid and retrievable.

        Args:
            cid: IPFS content hash
            expected_content: The rubric dict we expect

        Returns:
            True if CID is valid and content matches
        """
        retrieved = self.retrieve_rubric(cid)
        if not retrieved:
            return False

        # Deep comparison
        return retrieved == expected_content


# Singleton
_pinata_client: Optional[PinataClient] = None


def get_pinata_client() -> PinataClient:
    """Get or create the Pinata client."""
    global _pinata_client
    if _pinata_client is None:
        _pinata_client = PinataClient()
    return _pinata_client
