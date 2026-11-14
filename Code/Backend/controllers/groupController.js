const Group = require('../models/Group');
const Topic = require('../models/Topic');
const Milestone = require('../models/Milestone');
const Submission = require('../models/Submission');
const { getTopicMilestoneProgress } = require('../services/milestoneProgress');

// API lấy danh sách nhóm do Giảng viên hướng dẫn
exports.getGroupsByLecturer = async (req, res) => {
    try {
        const { lecturerCode } = req.params;
        // Lấy danh sách nhóm và nối (populate) thông tin tên đề tài từ bảng Topic
        let groups = await Group.find({ 
            lecturer_code: lecturerCode,
            is_approved: true 
        }).populate('topic_id');

        const approvedTopics = await Topic.find({
            lecturer_code: lecturerCode,
            status: 'APPROVED'
        }).lean();
        const approvedTopicIds = approvedTopics.map(topic => topic._id);
        const [milestones, submissions] = await Promise.all([
            Milestone.find({ lecturerCode, topicId: null }).sort({ step: 1 }).lean(),
            Submission.find({
                topic_id: { $in: approvedTopicIds },
                is_draft: { $ne: true }
            }).lean()
        ]);
        const progressByTopic = getTopicMilestoneProgress(approvedTopics, milestones, submissions);

        // Fallback: if the legacy Group collection is empty, use approved topics.
        if (!groups || groups.length === 0) {
            groups = approvedTopics.map((topic, index) => ({
                _id: topic._id,
                group_code: topic.topic_code || `N${String(index + 1).padStart(2, '0')}`,
                lecturer_code: topic.lecturer_code,
                leader_code: topic.leader_code,
                member2_code: topic.member2_code,
                progress: topic.progress || 0,
                is_approved: true,
                topic_id: topic
            }));
        }

        // Format lại dữ liệu trước khi gửi về cho Frontend
        const topicById = new Map(approvedTopics.map(topic => [String(topic._id), topic]));
        const formattedGroups = groups.map(g => {
            const topicId = g.topic_id?._id || g.topic_id;
            const topic = topicById.get(String(topicId)) || g.topic_id || g;
            const progress = progressByTopic.get(String(topic._id)) || {};
            return {
                _id: g._id,
                group_code: g.group_code || topic.topic_code || `N${String(1).padStart(2, '0')}`,
                title: topic.title || g.title || "Đề tài chưa cập nhật",
                category: topic.category || g.category || "Web / Ứng dụng",
                leader_code: g.leader_code || topic.leader_code,
                member2_code: g.member2_code || topic.member2_code,
                member3_code: g.member3_code || topic.member3_code,
                progress: progress.progress_percentage ?? g.progress ?? topic.progress ?? 0,
                ...progress,
                topic
            };
        });

        return res.status(200).json({
            success: true,
            data: formattedGroups
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Lỗi máy chủ: " + error.message
        });
    }
};