import os

# the shipped mechanics (skills, ampeffects, amptypes …): public/data in the repo, CA2_DATA_DIR in the image
DATA_DIR = os.environ.get("CA2_DATA_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "data")
