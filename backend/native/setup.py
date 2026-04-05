"""
Build script for the flight_math C extension module.

Usage
-----
    python native/setup.py build_ext --inplace

The compiled shared object (`.so` / `.pyd`) will be placed in the project
root so it can be imported directly by the backend services.
"""

from setuptools import setup, Extension
import os

native_dir = os.path.dirname(os.path.abspath(__file__))

flight_math_ext = Extension(
    "flight_math",
    sources=[os.path.join(native_dir, "flight_math.c")],
    extra_compile_args=["-O3", "-ffast-math"],
)

setup(
    name="flight_math",
    version="1.0.0",
    description="High-performance C math routines for UAV telemetry analysis",
    ext_modules=[flight_math_ext],
)
