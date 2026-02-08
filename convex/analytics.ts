'use node';

import { internalAction } from './_generated/server';
import { v } from 'convex/values';

/**
 * Google Analytics 4 Integration Skill
 * 
 * Connects to GA4 Data API to fetch analytics data.
 * Uses a Service Account for authentication.
 * 
 * Required environment variables:
 * - GA4_PROPERTY_ID: Your GA4 property ID (e.g., "123456789")
 * - GA4_SERVICE_ACCOUNT_EMAIL: Service account email
 * - GA4_PRIVATE_KEY: Service account private key (PEM format)
 */

// JWT creation for Google API authentication
async function createJWT(
    serviceAccountEmail: string,
    privateKey: string,
    scopes: string[]
): Promise<string> {
    const header = {
        alg: 'RS256',
        typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: serviceAccountEmail,
        sub: serviceAccountEmail,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: scopes.join(' '),
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    // Import crypto for signing
    const crypto = await import('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(privateKey, 'base64url');

    return `${signatureInput}.${signature}`;
}

// Get access token from Google OAuth
async function getAccessToken(
    serviceAccountEmail: string,
    privateKey: string
): Promise<string> {
    const jwt = await createJWT(serviceAccountEmail, privateKey, [
        'https://www.googleapis.com/auth/analytics.readonly',
    ]);

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get access token: ${error}`);
    }

    const data = await response.json();
    return data.access_token;
}

// GA4 Data API request
interface GA4Request {
    dateRanges: { startDate: string; endDate: string }[];
    dimensions?: { name: string }[];
    metrics: { name: string }[];
    limit?: number;
    orderBys?: { metric?: { metricName: string }; dimension?: { dimensionName: string }; desc?: boolean }[];
}

interface GA4Response {
    rows?: {
        dimensionValues?: { value: string }[];
        metricValues?: { value: string }[];
    }[];
    rowCount?: number;
}

async function runGA4Report(
    propertyId: string,
    accessToken: string,
    request: GA4Request
): Promise<GA4Response> {
    const response = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`GA4 API error: ${error}`);
    }

    return response.json();
}

// Pre-built report templates
const REPORT_TEMPLATES = {
    overview: {
        description: 'Site overview - sessions, users, pageviews, bounce rate',
        request: (dateRange: { startDate: string; endDate: string }) => ({
            dateRanges: [dateRange],
            metrics: [
                { name: 'sessions' },
                { name: 'totalUsers' },
                { name: 'screenPageViews' },
                { name: 'bounceRate' },
                { name: 'averageSessionDuration' },
            ],
        }),
    },
    topPages: {
        description: 'Top pages by pageviews',
        request: (dateRange: { startDate: string; endDate: string }) => ({
            dateRanges: [dateRange],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
            limit: 10,
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        }),
    },
    trafficSources: {
        description: 'Traffic sources breakdown',
        request: (dateRange: { startDate: string; endDate: string }) => ({
            dateRanges: [dateRange],
            dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
            metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
            limit: 10,
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        }),
    },
    deviceBreakdown: {
        description: 'Device category breakdown',
        request: (dateRange: { startDate: string; endDate: string }) => ({
            dateRanges: [dateRange],
            dimensions: [{ name: 'deviceCategory' }],
            metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'bounceRate' }],
        }),
    },
    countries: {
        description: 'Top countries by users',
        request: (dateRange: { startDate: string; endDate: string }) => ({
            dateRanges: [dateRange],
            dimensions: [{ name: 'country' }],
            metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
            limit: 10,
            orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
        }),
    },
};

// Format GA4 response into readable text
function formatResponse(reportType: string, response: GA4Response): string {
    if (!response.rows || response.rows.length === 0) {
        return 'No data available for the specified date range.';
    }

    const lines: string[] = [];

    switch (reportType) {
        case 'overview': {
            const row = response.rows[0];
            if (row.metricValues) {
                lines.push('📊 **Site Overview**');
                lines.push(`- Sessions: ${parseInt(row.metricValues[0]?.value || '0').toLocaleString()}`);
                lines.push(`- Users: ${parseInt(row.metricValues[1]?.value || '0').toLocaleString()}`);
                lines.push(`- Page Views: ${parseInt(row.metricValues[2]?.value || '0').toLocaleString()}`);
                lines.push(`- Bounce Rate: ${(parseFloat(row.metricValues[3]?.value || '0') * 100).toFixed(1)}%`);
                lines.push(`- Avg Session Duration: ${Math.round(parseFloat(row.metricValues[4]?.value || '0'))}s`);
            }
            break;
        }
        case 'topPages': {
            lines.push('📄 **Top Pages**');
            response.rows.forEach((row, i) => {
                const page = row.dimensionValues?.[0]?.value || 'Unknown';
                const views = parseInt(row.metricValues?.[0]?.value || '0').toLocaleString();
                lines.push(`${i + 1}. ${page} - ${views} views`);
            });
            break;
        }
        case 'trafficSources': {
            lines.push('🔗 **Traffic Sources**');
            response.rows.forEach((row) => {
                const source = row.dimensionValues?.[0]?.value || 'Unknown';
                const medium = row.dimensionValues?.[1]?.value || '';
                const sessions = parseInt(row.metricValues?.[0]?.value || '0').toLocaleString();
                lines.push(`- ${source}/${medium}: ${sessions} sessions`);
            });
            break;
        }
        case 'deviceBreakdown': {
            lines.push('📱 **Device Breakdown**');
            response.rows.forEach((row) => {
                const device = row.dimensionValues?.[0]?.value || 'Unknown';
                const sessions = parseInt(row.metricValues?.[0]?.value || '0').toLocaleString();
                const bounceRate = (parseFloat(row.metricValues?.[2]?.value || '0') * 100).toFixed(1);
                lines.push(`- ${device}: ${sessions} sessions (${bounceRate}% bounce)`);
            });
            break;
        }
        case 'countries': {
            lines.push('🌍 **Top Countries**');
            response.rows.forEach((row, i) => {
                const country = row.dimensionValues?.[0]?.value || 'Unknown';
                const users = parseInt(row.metricValues?.[0]?.value || '0').toLocaleString();
                lines.push(`${i + 1}. ${country}: ${users} users`);
            });
            break;
        }
        default:
            lines.push(JSON.stringify(response, null, 2));
    }

    return lines.join('\n');
}

// Parse natural language date ranges
function parseDateRange(query: string): { startDate: string; endDate: string } {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('today')) {
        return { startDate: formatDate(today), endDate: formatDate(today) };
    }
    if (lowerQuery.includes('yesterday')) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { startDate: formatDate(yesterday), endDate: formatDate(yesterday) };
    }
    if (lowerQuery.includes('last 7 days') || lowerQuery.includes('this week') || lowerQuery.includes('past week')) {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { startDate: formatDate(weekAgo), endDate: formatDate(today) };
    }
    if (lowerQuery.includes('last 30 days') || lowerQuery.includes('this month') || lowerQuery.includes('past month')) {
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 30);
        return { startDate: formatDate(monthAgo), endDate: formatDate(today) };
    }
    if (lowerQuery.includes('last 90 days') || lowerQuery.includes('3 months') || lowerQuery.includes('quarter')) {
        const quarterAgo = new Date(today);
        quarterAgo.setDate(quarterAgo.getDate() - 90);
        return { startDate: formatDate(quarterAgo), endDate: formatDate(today) };
    }

    // Default to last 7 days
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return { startDate: formatDate(weekAgo), endDate: formatDate(today) };
}

// Detect report type from query
function detectReportType(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('page') || lowerQuery.includes('url') || lowerQuery.includes('content')) {
        return 'topPages';
    }
    if (lowerQuery.includes('source') || lowerQuery.includes('traffic') || lowerQuery.includes('referr')) {
        return 'trafficSources';
    }
    if (lowerQuery.includes('device') || lowerQuery.includes('mobile') || lowerQuery.includes('desktop')) {
        return 'deviceBreakdown';
    }
    if (lowerQuery.includes('countr') || lowerQuery.includes('geo') || lowerQuery.includes('location')) {
        return 'countries';
    }

    return 'overview';
}

/**
 * Main GA4 query action
 */
export const queryAnalytics = internalAction({
    args: {
        query: v.string(),
    },
    handler: async (_, args): Promise<string> => {
        // Get environment variables
        const propertyId = process.env.GA4_PROPERTY_ID;
        const serviceAccountEmail = process.env.GA4_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n');

        if (!propertyId || !serviceAccountEmail || !privateKey) {
            return 'Google Analytics is not configured. Please set GA4_PROPERTY_ID, GA4_SERVICE_ACCOUNT_EMAIL, and GA4_PRIVATE_KEY environment variables in Convex Dashboard.';
        }

        try {
            // Get access token
            const accessToken = await getAccessToken(serviceAccountEmail, privateKey);

            // Parse the query
            const dateRange = parseDateRange(args.query);
            const reportType = detectReportType(args.query);
            const template = REPORT_TEMPLATES[reportType as keyof typeof REPORT_TEMPLATES];

            if (!template) {
                return 'Could not understand the analytics request. Try asking about: overview, top pages, traffic sources, devices, or countries.';
            }

            // Run the report
            const request = template.request(dateRange);
            const response = await runGA4Report(propertyId, accessToken, request);

            // Format and return
            const formatted = formatResponse(reportType, response);
            return `${formatted}\n\n*Data for ${dateRange.startDate} to ${dateRange.endDate}*`;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return `Failed to fetch analytics: ${message}`;
        }
    },
});

/**
 * List available reports
 */
export const listReports = internalAction({
    args: {},
    handler: async (): Promise<string> => {
        const lines = ['📊 **Available Analytics Reports**\n'];

        for (const [name, template] of Object.entries(REPORT_TEMPLATES)) {
            lines.push(`- **${name}**: ${template.description}`);
        }

        lines.push('\n**Date ranges**: today, yesterday, last 7 days, last 30 days, last 90 days');

        return lines.join('\n');
    },
});
