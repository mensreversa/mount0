# Mount0 Infrastructure

Pulumi infrastructure for `mount0.com`, `docs.mount0.com`, and `slides.mount0.com`.

## Overview

This project manages the AWS infrastructure for the Mount0 project, including:

- **S3 Buckets**: Static website hosting for the main site, documentation, and presentation slides.
- **CloudFront Distributions**: Global CDN with HTTPS support and SPA routing.
- **ACM Certificates**: Managed SSL/TLS certificates with DNS validation via Route53.
- **Route53 DNS**: Automatic alias records for all domains.

## Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) configured with appropriate credentials.
- A Route53 Hosted Zone for `mount0.com` must already exist.
- An S3 bucket for Pulumi state (e.g., `mount0-pulumi-state` or shared `supaquant-pulumi-state`).

## Getting Started

1. **Setup State Backend**:
   Create a bucket in your AWS account to host the Pulumi state and log in:

   ```bash
   aws s3 mb s3://mount0-pulumi-state
   pulumi login s3://mount0-pulumi-state
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Initialize or select a stack**:

   ```bash
   # Set a passphrase for secrets encryption
   export PULUMI_CONFIG_PASSPHRASE="your-safe-passphrase"
   pulumi stack init dev
   ```

4. **Configure AWS region**:

   ```bash
   pulumi config set aws:region eu-west-1
   ```

5. **Deploy**:
   ```bash
   pulumi up
   ```

## GitHub Actions Secret Setup

To make the automated deployment work with the S3 backend, add these secrets to GitHub:

- `PULUMI_BACKEND_URL`: Set to `s3://mount0-pulumi-state` (or update in `deploy.yml`).
- `PULUMI_CONFIG_PASSPHRASE`: The passphrase used during `stack init`.
- `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY`.

## Project Structure

- `src/index.ts`: Main Pulumi entry point defining all resources.
- `Pulumi.yaml`: Project metadata.
- `Pulumi.dev.yaml`: Stack-specific configuration.
- `package.json`: Dependencies and main entry point definition.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
