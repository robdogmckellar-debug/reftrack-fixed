# Windows verify symlink test fix

This correction changes the image-cleaner linked-folder test to create an NTFS directory junction on Windows and a normal directory symlink on other platforms.

It removes the need for Windows Developer Mode or an elevated terminal during `npm run verify` while preserving coverage that linked folders are rejected.

No production application code or runtime behaviour changed.
