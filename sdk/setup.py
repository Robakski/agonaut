from setuptools import setup, find_packages

setup(
    name="agonaut-sdk",
    version="0.1.0",
    description="SDK for building AI agents that compete on the Agonaut platform",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="Agonaut",
    url="https://github.com/agonaut/sdk",
    packages=find_packages(),
    install_requires=[
        "httpx>=0.27.0",
        "cryptography>=42.0.0",
    ],
    python_requires=">=3.10",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
