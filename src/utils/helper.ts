import crypto from 'crypto'

/**
 * 生成 MD5 哈希值
 *
 * @author CaoMeiYouRen
 * @date 2024-10-25
 * @export
 * @param str
 */
export function md5(str: string) {
    return crypto.createHash('md5').update(str).digest('hex')
}

/**
 * 将 RSSHUB_NODE_URLS 解析为数组
 *
 * @author CaoMeiYouRen
 * @date 2024-10-24
 * @export
 * @param value
 */
export function parseNodeUrls(value: string) {
    return [...new Set(value.split(',')
        .map((url) => url.trim())),
    ] // 去重
}

/**
 * 从给定的数组中随机挑选五个不重复的项
 * 采用洗牌算法，概率相同
 *
 * @author CaoMeiYouRen
 * @date 2024-10-24
 * @export
 * @template T
 * @param array
 * @param count
 */
export function randomPick<T>(array: T[], count: number): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.slice(0, count)
}

/**
 * 使用 fetch 函数并检查响应状态
 * 如果 响应状态码不是 2xx，则抛出错误
 *
 * @author CaoMeiYouRen
 * @date 2024-10-25
 * @export
 * @param url
 */
export async function fetchWithStatusCheck(url: string | URL | Request) {
    const response = await fetch(url)
    if (response.ok) {
        return response
    }
    throw new Error(`Request to ${url} failed with status ${response.status}`)
}
