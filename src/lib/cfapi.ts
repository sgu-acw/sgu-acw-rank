/* eslint-disable preserve-caught-error -- 这里的 catch 是兜底重试，不是要包装错误 */
import axios from "axios";
import type { Submission, User, RatingChange } from "./interfaces/cfapi";

async function fetchUserInfo(handles: string[]) {
    try {
        const response = await axios.get(`https://codeforces-api.zh314.xyz/user.info?handles=${handles.join(";")}`);
        return response;
    } catch (error) {
        console.error("Error fetching user info from proxy API:", error);
        try {
            const response = await axios.get(`https://codeforces.com/api/user.info?handles=${handles.join(";")}`);
            return response;
        } catch (fallbackError) {
            console.error("Error fetching user info from official API:", fallbackError);
            throw fallbackError;
        }
    }
}

async function* fetchUserInfoStructured(handles: string[]): AsyncGenerator<User> {
    const data = (await fetchUserInfo(handles)).data;
    if (data.status !== "OK") throw new Error("Failed to fetch user info");
    for (const rawInfo of data.result) yield rawInfo;
}

async function fetchOneUserInfoStructured(handle: string): Promise<User> {
    const asyncGen = fetchUserInfoStructured([handle]);
    return (await asyncGen.next()).value;
}

async function fetchUserStatus(handle: string) {
    try {
        const response = await axios.get(
            `https://codeforces-api.zh314.xyz/user.status?handle=${handle}&from=1&count=100000`
        );
        return response;
    } catch (error) {
        console.error(`Error fetching user status for ${handle} from proxy API:`, error);
        try {
            const response = await axios.get(
                `https://codeforces.com/api/user.status?handle=${handle}&from=1&count=100000`
            );
            return response;
        } catch (fallbackError) {
            console.error(`Error fetching user status for ${handle} from official API:`, fallbackError);
            throw fallbackError;
        }
    }
}

async function fetchUserStatusStructured(handle: string): Promise<Submission[]> {
    const data = (await fetchUserStatus(handle)).data;
    if (data.status !== "OK") throw new Error(`Failed to fetch user status for ${handle}`);
    return data.result as Submission[];
}

async function fetchUserRating(handle: string): Promise<RatingChange[]> {
    try {
        const response = await axios.get(
            `https://codeforces-api.zh314.xyz/user.rating?handle=${handle}`
        );
        const data = response.data;
        if (data.status !== "OK") throw new Error(`Failed to fetch user rating for ${handle}`);
        return data.result as RatingChange[];
    } catch (error) {
        console.error(`Error fetching user rating for ${handle} from proxy API:`, error);
        try {
            const response = await axios.get(
                `https://codeforces.com/api/user.rating?handle=${handle}`
            );
            const data = response.data;
            if (data.status !== "OK") throw new Error(`Failed to fetch user rating for ${handle}`);
            return data.result as RatingChange[];
        } catch (fallbackError) {
            console.error(`Error fetching user rating for ${handle} from official API:`, fallbackError);
            throw fallbackError;
        }
    }
}

function processUserSubmissions(submissions: Submission[]) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todaySolvedProblems = new Set<string>();
    submissions.forEach((submission) => {
        const submissionTime = new Date(submission.creationTimeSeconds * 1000);
        if (
            submission.verdict === "OK" &&
            submissionTime >= today &&
            submissionTime < tomorrow
        ) {
            todaySolvedProblems.add(submission.problem.name);
        }
    });

    const allSolvedProblems = new Set<string>();
    submissions.forEach((submission) => {
        if (submission.verdict && submission.verdict === "OK") {
            allSolvedProblems.add(submission.problem.name);
        }
    });

    return { todaySolvedProblems, allSolvedProblems };
}

function getColor(rating: number): string {
    const ratMap: Record<number, string> = {
        0: "gray",
        1200: "green",
        1400: "cyan",
        1600: "blue",
        1900: "purple",
        2100: "orange",
        2600: "red",
    };
    for (const rat of Object.keys(ratMap).map(Number).reverse())
        if (rating >= rat) return ratMap[rat];
    return "gray";
}

function getRatingColorClass(rating: number): string {
    if (rating >= 2600) return 'text-red-600 bg-red-500/20';
    if (rating >= 2100) return 'text-orange-500 bg-orange-500/20';
    if (rating >= 1900) return 'text-purple-500 bg-purple-500/20';
    if (rating >= 1600) return 'text-blue-500 bg-blue-500/20';
    if (rating >= 1400) return 'text-cyan-500 bg-cyan-500/20';
    if (rating >= 1200) return 'text-green-500 bg-green-500/20';
    return 'text-gray-500 bg-gray-500/20';
}

function getRatingHexColor(rating: number): string {
    if (rating >= 2600) return '#dc2626';
    if (rating >= 2100) return '#f97316';
    if (rating >= 1900) return '#a855f7';
    if (rating >= 1600) return '#3b82f6';
    if (rating >= 1400) return '#06b6d4';
    if (rating >= 1200) return '#22c55e';
    return '#6b7280';
}

export {
    fetchUserInfo,
    fetchUserInfoStructured,
    fetchOneUserInfoStructured,
    fetchUserStatus,
    fetchUserStatusStructured,
    processUserSubmissions,
    getColor,
    getRatingColorClass,
    getRatingHexColor,
    fetchUserRating,
};
