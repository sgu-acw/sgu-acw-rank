import axios from "axios";
import type { Submission } from "@/interface/CFAPI";

const fetchUserInfo = async (handles: string[]) => {
    try {
        // `https://codeforces.com/api/user.info?handles=${handles.join(";")}`
        const response = await axios.get(`https://codeforces-api.zh314.xyz/user.info?handles=${handles.join(";")}`);
        return response;
    } catch (error) {
        console.error("Error fetching user info:", error);
        throw error;
    }
};

const fetchUserStatus = async (handle: string) => {
    try {
        const response = await axios.get(
            // `https://codeforces.com/api/user.status?handle=${handle}&from=1&count=100000`
            `https://codeforces-api.zh314.xyz/user.status?handle=${handle}&from=1&count=100000`
        );
        return response;
    } catch (error) {
        console.error(`Error fetching user status for ${handle}:`, error);
        throw error;
    }
};

const processUserSubmissions = (submissions: Submission[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1); // Start of tomorrow

    const todaySolvedProblems = new Set<string>();
    submissions.forEach(
        (submission: {
            creationTimeSeconds: number;
            problem: { name: string };
            verdict?: string;
        }) => {
            const submissionTime = new Date(submission.creationTimeSeconds * 1000);
            if (
                submission.verdict === "OK" &&
                submissionTime >= today &&
                submissionTime < tomorrow // Check if submission time is within today
            ) {
                todaySolvedProblems.add(submission.problem.name);
            }
        }
    );

    const allSolvedProblems = new Set<string>();
    submissions.forEach(
        (submission: {
            problem: { name: string };
            verdict?: string;
        }) => {
            if (submission.verdict && submission.verdict === "OK") {
                allSolvedProblems.add(submission.problem.name);
            }
        }
    );

    return { todaySolvedProblems, allSolvedProblems };
};
function getColor(rating: number) {
    const ratMap: Record<number, string> = {
        0: "gray",
        1200: "green",
        1400: "cyan",
        1600: "blue",
        1900: "purple",
        2100: "orange",
        2600: "red",
        3000: "black",
        4000: "white",
    };
    for (let rat of Object.keys(ratMap).map(Number).reverse())
        if (rating >= rat) return ratMap[rat];
}
export {
    fetchUserInfo,
    fetchUserStatus,
    processUserSubmissions,
    getColor,
};


