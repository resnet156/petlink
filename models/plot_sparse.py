"""Plot measured COLMAP feature points/camera poses; axes are not a floorplan."""
import argparse
import json
from pathlib import Path


def main():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np
    parser = argparse.ArgumentParser()
    parser.add_argument("coordinates", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--note", default="Arbitrary scale and orientation. No dense surface or complete floorplan is claimed.")
    args = parser.parse_args()
    data = json.loads(args.coordinates.read_text())
    points = np.array([p["xyz"] for p in data["points"]])
    colors = np.array([p["color"] for p in data["points"]]) / 255
    cameras = np.array([c["center"] for c in data["cameras"]])
    all_positions = np.vstack((points, cameras))
    extent = np.ptp(all_positions, axis=0)
    arrow_length = float(np.max(extent)) * 0.07
    fig = plt.figure(figsize=(15, 7), facecolor="#f7f9fc")
    ax = fig.add_subplot(121, projection="3d")
    ax.scatter(*points.T, c=colors, s=30, edgecolors="#526077", linewidths=0.4, depthshade=False)
    ax2 = fig.add_subplot(122)
    ax2.scatter(points[:, 0], points[:, 2], c=colors, s=30, edgecolors="#526077", linewidths=0.4)
    for camera in data["cameras"]:
        center = np.array(camera["center"])
        rotation = np.array(camera["worldToCamera"])[:, :3]
        forward = rotation.T @ np.array([0, 0, 1.0])
        label = camera["image"].removeprefix("view_").removesuffix(".png")
        ax.scatter(*center, color="#f06437", marker="^", s=80)
        ax.text(*center, f"  Camera {label}", fontsize=9)
        ax.quiver(*center, *forward, length=arrow_length, color="#f06437")
        ax2.scatter(center[0], center[2], color="#f06437", marker="^", s=80)
        ax2.annotate(f"  Camera {label}", (center[0], center[2]), fontsize=9)
        ax2.arrow(center[0], center[2], forward[0] * arrow_length, forward[2] * arrow_length, color="#f06437", width=arrow_length * 0.015)
    ax.set_box_aspect(np.maximum(extent, 0.1))
    ax.view_init(elev=22, azim=35)
    ax.set(xlabel="X (relative)", ylabel="Y (relative)", zlabel="Z (relative)", title="Triangulated feature points + registered cameras")
    ax2.set(xlabel="X (relative)", ylabel="Z (relative)", title="Coordinate projection — NOT a measured floorplan")
    ax2.set_aspect("equal", adjustable="box")
    ax2.grid(alpha=0.18)
    fig.suptitle(f"COLMAP: {len(points)} sparse points / {len(cameras)} registered photos", fontsize=18, fontweight="bold")
    fig.text(0.5, 0.025, args.note, ha="center", fontsize=10, color="#536078")
    fig.tight_layout(rect=(0, 0.10, 1, 0.94))
    fig.savefig(args.output, dpi=150)


if __name__ == "__main__":
    main()
